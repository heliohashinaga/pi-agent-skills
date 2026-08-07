import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";

/**
 * Shared locking + atomic-write primitives.
 *
 * Both the run lease (`cancellation.ts`) and the chain registry (`stack.ts`)
 * guard their read/modify/write of a JSON file with `proper-lockfile` using the
 * same options (atomic mkdir lease, ownership-aware release, stale recovery,
 * heartbeats) and the same temp-file-then-rename write. Centralizing that
 * boilerplate here keeps the two call sites identical and DRY; the only thing a
 * caller supplies is the directory to lock and the lock filename.
 */

/** Options shared with every `proper-lockfile.lock` call in the extension. */
export const LOCK_OPTIONS = {
	realpath: false,
	stale: 30_000,
	update: 10_000,
	retries: { retries: 20, factor: 1.4, minTimeout: 10, maxTimeout: 250 },
} as const;

/**
 * Run `fn` while holding a `proper-lockfile` lock on `dir` (created if missing).
 * The lock file lives at `${dir}/${lockFileName}`. Always releases, even on
 * throw. Mirrors the previous inline `acquireLock` / `withStackLock` helpers.
 */
export async function withLock<T>(
	dir: string,
	lockFileName: string,
	fn: () => Promise<T>,
): Promise<T> {
	mkdirSync(dir, { recursive: true });
	const release = await lockfile.lock(dir, {
		...LOCK_OPTIONS,
		lockfilePath: path.join(dir, lockFileName),
	});
	try {
		return await fn();
	} finally {
		await release();
	}
}

/**
 * Atomically write `content` to `target` (UTF-8) via a temp file + rename, so a
 * crash mid-write never leaves a truncated JSON file. `mode` defaults to 0o666
 * (matching `writeFileSync`); the lease passes 0o600 for owner-only access.
 */
export function atomicWrite(target: string, content: string, mode: number = 0o666): void {
	const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
	writeFileSync(temporary, content, { encoding: "utf8", mode });
	renameSync(temporary, target);
}
