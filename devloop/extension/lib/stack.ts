import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { atomicWrite, withLock } from "./lock";
import {
	stackFile,
	stackLockFile,
	STACK_FILENAME as STACK_FILENAME_STORAGE,
} from "./storage";

/**
 * Devloop chain registry — `.pi/devloop/stack.json`.
 *
 * Records the ordered sequence of devloop runs that form a "stack": each run's
 * branch is created from the tip (`chainTip` = last entry's branch, or `base`
 * when empty), so successive `/devloop` invocations chain into stacked PRs
 * rather than orphan branches. Every read/write is guarded by a proper-lockfile
 * so concurrent Pi sessions cannot corrupt the chain.
 */

export const STACK_FILENAME = STACK_FILENAME_STORAGE;

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
	return path.dirname(stackFile(repoRoot));
}

function stackFilePath(repoRoot: string): string {
	return stackFile(repoRoot);
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
	atomicWrite(stackFilePath(repoRoot), JSON.stringify(stack, null, 2));
}

/** Read the chain registry, or `undefined` if absent or corrupt. */
export async function readStack(repoRoot: string): Promise<StackConfig | undefined> {
	return withLock(stackDir(repoRoot), `${STACK_FILENAME}.lock`, async () => readStackUnlocked(repoRoot));
}

/**
 * Ensure a stack exists for the given name/base. If one already exists, it is
 * returned untouched (never overwritten).
 */
export async function ensureStack(repoRoot: string, name: string, base: string): Promise<StackConfig> {
	return withLock(stackDir(repoRoot), `${STACK_FILENAME}.lock`, async () => {
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
	return withLock(stackDir(repoRoot), `${STACK_FILENAME}.lock`, async () => {
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
	return withLock(stackDir(repoRoot), `${STACK_FILENAME}.lock`, async () => {
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
