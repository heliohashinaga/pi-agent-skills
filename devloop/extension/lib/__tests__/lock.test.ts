import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { atomicWrite, withLock, LOCK_OPTIONS } from "../lock";

/**
 * The shared locking + atomic-write primitives used by both the run lease
 * (`cancellation.ts`) and the chain registry (`stack.ts`). These tests pin the
 * contract the two callers depend on: a real cross-process lock, temp-then-
 * rename atomicity, and stable lock options.
 */

describe("devloop shared lock + atomic write", () => {
	let dir: string;

	test("LOCK_OPTIONS matches the canonical proper-lockfile settings", () => {
		// Both callers previously inlined these exact options; centralizing them
		// must not silently relax recovery/heartbeat behavior.
		expect(LOCK_OPTIONS).toEqual({
			realpath: false,
			stale: 30_000,
			update: 10_000,
			retries: { retries: 20, factor: 1.4, minTimeout: 10, maxTimeout: 250 },
		});
	});

	test("withLock creates the directory and runs fn under the lock", async () => {
		dir = mkdtempSync(path.join(tmpdir(), "devloop-lock-"));
		const target = path.join(dir, "data.json");
		const lockFile = path.join(dir, "data.lock");

		await withLock(dir, "data.lock", async () => {
			expect(existsSync(lockFile)).toBe(true);
			writeFileSync(target, "inside", "utf8");
		});

		expect(readFileSync(target, "utf8")).toBe("inside");
		// proper-lockfile removes the lock file on release.
		expect(existsSync(lockFile)).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});

	test("withLock serializes concurrent writers (no interleaving corruption)", async () => {
		dir = mkdtempSync(path.join(tmpdir(), "devloop-lock-concurrent-"));
		const target = path.join(dir, "counter.json");

		// N writers each append-and-rewrite a shared counter under the lock.
		// Without the lock, rename races would drop increments; with it, the
		// final count must equal the number of writers.
		const N = 8;
		const writers = Array.from({ length: N }, (_, i) =>
			withLock(dir, "counter.lock", async () => {
				let current = 0;
				if (existsSync(target)) current = Number(readFileSync(target, "utf8")) || 0;
				// Simulate a tiny async yield inside the critical section so a
				// non-locking implementation would interleave.
				await Promise.resolve();
				atomicWrite(target, String(current + 1));
			}),
		);
		await Promise.all(writers);

		expect(Number(readFileSync(target, "utf8"))).toBe(N);
		rmSync(dir, { recursive: true, force: true });
	});

	test("atomicWrite writes content and never leaves a temp file behind", () => {
		dir = mkdtempSync(path.join(tmpdir(), "devloop-atomic-"));
		const target = path.join(dir, "lease.json");

		atomicWrite(target, JSON.stringify({ runId: "x" }, null, 2), 0o600);

		expect(readFileSync(target, "utf8")).toBe(JSON.stringify({ runId: "x" }, null, 2));
		// No stray temp files (*.tmp) remain.
		const leftovers = existsSync(path.join(dir, "lease.json.0.tmp")) || existsSync(path.join(dir, "lease.json.tmp"));
		expect(leftovers).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});

	test("atomicWrite replaces an existing file whole (not appended)", () => {
		dir = mkdtempSync(path.join(tmpdir(), "devloop-atomic-replace-"));
		const target = path.join(dir, "stack.json");
		mkdirSync(dir, { recursive: true });
		writeFileSync(target, "OLD-LONGER-CONTENT-THAN-NEW", "utf8");

		atomicWrite(target, "NEW");

		expect(readFileSync(target, "utf8")).toBe("NEW");
		rmSync(dir, { recursive: true, force: true });
	});
});
