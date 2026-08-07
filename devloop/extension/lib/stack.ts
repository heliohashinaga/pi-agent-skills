import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";

/**
 * Devloop chain registry — `.pi/devloop-stack.json`.
 *
 * Records the ordered sequence of devloop runs that form a "stack": each run's
 * branch is created from the tip (`chainTip` = last entry's branch, or `base`
 * when empty), so successive `/devloop` invocations chain into stacked PRs
 * rather than orphan branches. Every read/write is guarded by a proper-lockfile
 * so concurrent Pi sessions cannot corrupt the chain.
 */

export const STACK_FILENAME = "devloop-stack.json";

export interface StackEntry {
	/** Devloop task id this run integrated (e.g. "T020"). */
	task: string;
	/** The devloop branch created for this run. */
	branch: string;
	/** The branch this run's PR targets (previous entry's branch, else base). */
	prBase: string;
	/** Present only when a PR was actually opened for this branch. */
	prUrl?: string;
}

export interface StackConfig {
	/** Logical stack name (e.g. "phase-3"). */
	name: string;
	/** Integration floor the whole stack merges into (e.g. "main"). */
	base: string;
	/** Ordered oldest → tip. */
	entries: StackEntry[];
}

function stackDir(repoRoot: string): string {
	return path.join(repoRoot, ".pi");
}

function stackFilePath(repoRoot: string): string {
	return path.join(stackDir(repoRoot), STACK_FILENAME);
}

function stackLockPath(repoRoot: string): string {
	return path.join(stackDir(repoRoot), `${STACK_FILENAME}.lock`);
}

/**
 * proper-lockfile uses an atomic mkdir lease, ownership-aware release, stale
 * lock recovery, and heartbeats — mirrors the lease locking in cancellation.ts.
 */
async function withStackLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
	mkdirSync(stackDir(repoRoot), { recursive: true });
	const release = await lockfile.lock(stackDir(repoRoot), {
		realpath: false,
		lockfilePath: stackLockPath(repoRoot),
		stale: 30_000,
		update: 10_000,
		retries: { retries: 20, factor: 1.4, minTimeout: 10, maxTimeout: 250 },
	});
	try {
		return await fn();
	} finally {
		await release();
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidStack(value: unknown): value is StackConfig {
	if (!isRecord(value)) return false;
	if (typeof value.name !== "string" || typeof value.base !== "string") return false;
	if (!Array.isArray(value.entries)) return false;
	return value.entries.every(
		(entry) =>
			isRecord(entry) &&
			typeof entry.task === "string" &&
			typeof entry.branch === "string" &&
			typeof entry.prBase === "string",
	);
}

function readStackUnlocked(repoRoot: string): StackConfig | undefined {
	try {
		const file = stackFilePath(repoRoot);
		if (!existsSync(file)) return undefined;
		const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
		return isValidStack(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function writeStackUnlocked(repoRoot: string, stack: StackConfig): void {
	const target = stackFilePath(repoRoot);
	const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
	writeFileSync(temporary, JSON.stringify(stack, null, 2), { encoding: "utf8" });
	renameSync(temporary, target);
}

/** Read the chain registry, or `undefined` if absent or corrupt. */
export async function readStack(repoRoot: string): Promise<StackConfig | undefined> {
	return withStackLock(repoRoot, async () => readStackUnlocked(repoRoot));
}

/**
 * Ensure a stack exists for the given name/base. If one already exists, it is
 * returned untouched (never overwritten).
 */
export async function ensureStack(repoRoot: string, name: string, base: string): Promise<StackConfig> {
	return withStackLock(repoRoot, async () => {
		const existing = readStackUnlocked(repoRoot);
		if (existing) return existing;
		const stack: StackConfig = { name, base, entries: [] };
		writeStackUnlocked(repoRoot, stack);
		return stack;
	});
}

/**
 * The commit/branch the next devloop run should branch from: the most recent
 * entry's branch, or `base` when the stack is empty.
 */
export async function chainTip(repoRoot: string, base: string): Promise<string> {
	return withStackLock(repoRoot, async () => {
		const stack = readStackUnlocked(repoRoot);
		const last = stack?.entries[stack.entries.length - 1];
		return last?.branch ?? base;
	});
}

export interface AppendStackEntryInput {
	task: string;
	branch: string;
	prUrl?: string;
}

/**
 * Append a completed run to the chain. `prBase` is derived from the previous
 * tip (or `base`) and returned so the caller can target the PR correctly.
 */
export async function appendStackEntry(
	repoRoot: string,
	name: string,
	base: string,
	input: AppendStackEntryInput,
): Promise<StackEntry> {
	return withStackLock(repoRoot, async () => {
		const stack = readStackUnlocked(repoRoot) ?? { name, base, entries: [] };
		const prBase = stack.entries[stack.entries.length - 1]?.branch ?? stack.base;
		const entry: StackEntry = { task: input.task, branch: input.branch, prBase, ...(input.prUrl ? { prUrl: input.prUrl } : {}) };
		stack.entries.push(entry);
		writeStackUnlocked(repoRoot, stack);
		return entry;
	});
}

/** Human-readable ordered view of the chain (for the final run notify). */
export async function stackSummary(repoRoot: string): Promise<string> {
	const stack = await readStack(repoRoot);
	if (!stack || stack.entries.length === 0) return "No devloop stack entries yet.";
	return stack.entries
		.map(
			(entry) =>
				`${entry.task}: ${entry.branch} → into ${entry.prBase}${entry.prUrl ? ` (PR ${entry.prUrl})` : ""}`,
		)
		.join("\n");
}
