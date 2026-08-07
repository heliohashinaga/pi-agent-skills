/**
 * Session + disk-backed atomic lease for the one devloop run allowed at a time.
 *
 * Uses proper-lockfile for cross-process mutual exclusion: every read/write of
 * the lease JSON is guarded by a real lockfile (O_CREAT|O_EXCL + retry) so
 * concurrent Pi instances cannot race on stale recovery, acquire, or update.
 *
 * Cancellation returns a discriminated status — never claims "cancelled" when
 * the owning PID is still alive after a reload.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { atomicWrite, withLock } from "./lock";

export interface ActiveDevloopRunInfo {
	runId: string;
	label: string;
	worktreePath: string;
	repoRoot: string;
	startedAt: number;
}

export interface LeaseRecord {
	runId: string;
	pid: number;
	sessionOwner: string;
	repoRoot: string;
	startedAt: number;
	label?: string;
	worktreePath?: string;
}

export type CancellationStatus = "cancelled" | "stale-cleaned" | "still-running";

/** Outcome of a cancellation; truthy when a run was affected. */
export interface DevloopCancellation {
	/** Discriminated status so callers know what happened. */
	status: CancellationStatus;
	/** Human-readable summary. */
	summary: string;
	/** Settles only after cleanup. */
	completion: Promise<void>;
}

// --- Configurable lease path (injectable for tests) ---

let _leaseDirOverride: string | undefined;

export function _setLeaseDirForTests(dir: string): void {
	_leaseDirOverride = dir;
}

function leaseDir(): string {
	if (_leaseDirOverride) return _leaseDirOverride;
	return path.join(os.homedir(), ".pi", "agent");
}

function leaseFilePath(): string {
	return path.join(leaseDir(), "devloop-lease.json");
}

function lockFilePath(): string {
	return path.join(leaseDir(), "devloop-lease.lock");
}

// --- Session owner ---

function sessionOwner(): string {
	return process.env.PI_SESSION_ID ?? process.env.USER ?? process.env.LOGNAME ?? "unknown";
}

// --- Process liveness ---

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

// --- Lease operations (all guarded by withLock) ---

async function withLeaseLock<T>(fn: () => Promise<T>): Promise<T> {
	return withLock(leaseDir(), "devloop-lease.lock", fn);
}

function readLeaseFileUnlocked(): LeaseRecord | undefined {
	try {
		const file = leaseFilePath();
		if (!existsSync(file)) return undefined;
		const parsed = JSON.parse(readFileSync(file, "utf8")) as LeaseRecord;
		if (
			!parsed ||
			typeof parsed.runId !== "string" ||
			!parsed.runId ||
			typeof parsed.pid !== "number" ||
			typeof parsed.startedAt !== "number" ||
			typeof parsed.sessionOwner !== "string" ||
			typeof parsed.repoRoot !== "string"
		) {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

function writeLeaseFileUnlocked(record: LeaseRecord): void {
	atomicWrite(leaseFilePath(), JSON.stringify(record, null, 2), 0o600);
}

function removeLeaseFileUnlocked(): void {
	try {
		rmSync(leaseFilePath(), { force: true });
	} catch {
		// best-effort
	}
}

async function readLeaseFile(): Promise<LeaseRecord | undefined> {
	return withLeaseLock(async () => readLeaseFileUnlocked());
}

function sameLeaseOwner(current: LeaseRecord, expected: LeaseRecord): boolean {
	return current.runId === expected.runId &&
		current.pid === expected.pid &&
		current.sessionOwner === expected.sessionOwner;
}

async function compareAndDeleteLease(expected: LeaseRecord): Promise<void> {
	await withLeaseLock(async () => {
		const current = readLeaseFileUnlocked();
		if (current && sameLeaseOwner(current, expected)) removeLeaseFileUnlocked();
	});
}

async function updateLeaseFile(record: LeaseRecord): Promise<void> {
	await withLeaseLock(async () => {
		const current = readLeaseFileUnlocked();
		if (!current || !sameLeaseOwner(current, record)) {
			throw new Error("Devloop lease ownership changed before the worktree update.");
		}
		writeLeaseFileUnlocked(record);
	});
}

/**
 * Recover a stale lease: the PID is no longer alive, AND a minimum grace
 * period has passed since startedAt. The lock prevents TOCTOU between the
 * liveness check and the file removal.
 * Returns the recovered lease info, or undefined.
 */
async function recoverStaleLease(now: number = Date.now()): Promise<LeaseRecord | undefined> {
	return withLeaseLock(async (): Promise<LeaseRecord | undefined> => {
		const lease = readLeaseFileUnlocked();
		if (!lease) return undefined;

		const MIN_LEASE_AGE_MS = 30_000;
		if (now - lease.startedAt < MIN_LEASE_AGE_MS) return undefined;
		if (isPidAlive(lease.pid)) return undefined;

		// PID dead + old enough → remove and recover.
		removeLeaseFileUnlocked();
		return lease;
	});
}

// --- In-memory state ---

interface ActiveDevloopRun {
	controller: AbortController;
	info: ActiveDevloopRunInfo | undefined;
	lease: LeaseRecord;
	settled: Promise<void>;
	resolveSettled: () => void;
}

let active: ActiveDevloopRun | undefined;

// --- Public API ---

export function getActiveDevloopRunId(): string | undefined {
	return active?.lease.runId ?? readLeaseFileUnlocked()?.runId;
}

export function hasActiveDevloopRun(): boolean {
	if (active !== undefined) return true;
	// Check disk synchronously for quick checks (no lock needed for read).
	const lease = readLeaseFileUnlocked();
	if (!lease) return false;
	return isPidAlive(lease.pid);
}

export async function beginDevloopRun(): Promise<AbortController> {
	if (active) throw new Error("A devloop run is already in progress.");

	// Stale recovery + acquire under the same lock to prevent TOCTOU.
	return withLeaseLock(async (): Promise<AbortController> => {
		// Try to recover a dead stale lease under lock.
		const stale = readLeaseFileUnlocked();
		if (stale) {
			const MIN_LEASE_AGE_MS = 30_000;
			if (Date.now() - stale.startedAt >= MIN_LEASE_AGE_MS && !isPidAlive(stale.pid)) {
				removeLeaseFileUnlocked();
			}
		}

		// Now check if a live lease remains.
		const current = readLeaseFileUnlocked();
		if (current && isPidAlive(current.pid)) {
			throw new Error(
				"A devloop run is already active on this machine. Use /devloop-stop to cancel it first, or wait for it to finish.",
			);
		}

		const lease: LeaseRecord = {
			runId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
			pid: process.pid,
			sessionOwner: sessionOwner(),
			repoRoot: "",
			startedAt: Date.now(),
		};

		writeLeaseFileUnlocked(lease);
		let resolveSettled: () => void = () => {};
		const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });
		active = { controller: new AbortController(), info: undefined, lease, settled, resolveSettled };
		return active.controller;
	});
}

export async function registerActiveDevloopRun(info: ActiveDevloopRunInfo): Promise<void> {
	if (!active) throw new Error("Cannot register a worktree without an active devloop lease.");
	const nextLease = {
		...active.lease,
		label: info.label,
		worktreePath: info.worktreePath,
		repoRoot: info.repoRoot,
	};
	await updateLeaseFile(nextLease);
	active.info = info;
	active.lease = nextLease;
}

export async function getActiveDevloopRun(): Promise<ActiveDevloopRunInfo | undefined> {
	if (active?.info) return active.info;
	const lease = await readLeaseFile();
	if (!lease?.worktreePath) return undefined;
	return {
		runId: lease.runId,
		label: lease.label ?? lease.runId,
		worktreePath: lease.worktreePath,
		repoRoot: lease.repoRoot,
		startedAt: lease.startedAt,
	};
}

export async function clearActiveDevloopRun(controller: AbortController): Promise<void> {
	if (active !== undefined && active.controller === controller) {
		const owned = active;
		await compareAndDeleteLease(owned.lease);
		active = undefined;
		owned.resolveSettled();
	}
	// Foreign clear attempt → ignore silently.
}

export function cancelActiveDevloopRun(): DevloopCancellation | undefined {
	// In-memory active run: abort and clear.
	if (active !== undefined) {
		active.controller.abort();
		const lease = active.lease;
		const summary = `Graceful abort of run ${lease.runId}.`;
		// The lease remains held until the owning /devloop handler reaches its
		// finally block. This prevents a second writer from starting while the
		// cancelled child is still unwinding.
		return { status: "cancelled", summary, completion: active.settled };
	}

	// After a reload: check disk for a lease synchronously first.
	const lease = readLeaseFileUnlocked();
	if (!lease) return undefined;

	if (isPidAlive(lease.pid)) {
		return {
			status: "still-running",
			summary: `Run ${lease.runId} (PID ${lease.pid}) is still running but the AbortController was lost after a reload. The owning process must be stopped from the session that launched it.`,
			completion: Promise.resolve(),
		};
	}

	// Lease on disk but PID is dead → stale lease.
	const completion = compareAndDeleteLease(lease);
	return {
		status: "stale-cleaned",
		summary: `Run ${lease.runId} (PID ${lease.pid}) is no longer alive. Stale lease cleaned up.`,
		completion,
	};
}

// --- Public helpers (exported for callers) ---

export { isPidAlive, recoverStaleLease, readLeaseFile };

// --- Test-only reset ---

export async function _resetCancellationForTests(): Promise<void> {
	active = undefined;
	try {
		if (_leaseDirOverride) {
			await rm(_leaseDirOverride, { recursive: true, force: true });
		} else {
			rmSync(leaseFilePath(), { force: true });
			rmSync(lockFilePath(), { force: true });
		}
	} catch {
		// best-effort
	}
}

export function _forgetInMemoryRunForTests(): void {
	active = undefined;
}

/** Inject a lease onto disk for testing recovery paths. Not under lock — test-only. */
export function _injectLeaseForTests(lease: LeaseRecord): void {
	try {
		const dir = leaseDir();
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(leaseFilePath(), JSON.stringify(lease, null, 2), "utf8");
	} catch {
		// best-effort
	}
}

export { compareAndDeleteLease };