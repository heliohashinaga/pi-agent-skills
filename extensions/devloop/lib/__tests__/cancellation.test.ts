import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	_forgetInMemoryRunForTests,
	_resetCancellationForTests,
	_setLeaseDirForTests,
	beginDevloopRun,
	cancelActiveDevloopRun,
	clearActiveDevloopRun,
	compareAndDeleteLease,
	getActiveDevloopRun,
	getActiveDevloopRunId,
	hasActiveDevloopRun,
	isPidAlive,
	readLeaseFile,
	recoverStaleLease,
	registerActiveDevloopRun,
	_injectLeaseForTests,
} from "../cancellation";

// Every test uses an isolated temp directory — never touches ~/.pi/agent.
// Recreate before each test since _resetCancellationForTests removes it.
let testDir: string;

afterEach(async () => {
	await _resetCancellationForTests();
	testDir = mkdtempSync(path.join(tmpdir(), "devloop-cancellation-"));
	_setLeaseDirForTests(testDir);
});

// Create initial dir before the first test.
testDir = mkdtempSync(path.join(tmpdir(), "devloop-cancellation-"));
_setLeaseDirForTests(testDir);

const INFO = {
	runId: "abc12345",
	label: "T019",
	worktreePath: "/home/helio/repos/storybook-ai-devloop-T019-abc12345",
	repoRoot: "/home/helio/repos/storybook-ai",
	startedAt: 1_700_000_000_000,
};

describe("devloop cancellation (atomic lease + proper-lockfile)", () => {
	test("begin acquires a lease and makes the run observable", async () => {
		const controller = await beginDevloopRun();
		expect(hasActiveDevloopRun()).toBe(true);

		const lease = await readLeaseFile();
		expect(lease).toBeTruthy();
		expect(lease!.runId).toBeTruthy();
		expect(lease!.pid).toBe(process.pid);
		expect(lease!.sessionOwner).toBeTruthy();
		expect(getActiveDevloopRunId()).toBe(lease!.runId);

		await clearActiveDevloopRun(controller);
		expect(hasActiveDevloopRun()).toBe(false);
	});

	test("begins a new run while one is active throws (in-memory guard)", async () => {
		const controller = await beginDevloopRun();
		await expect(beginDevloopRun()).rejects.toThrow(/already in progress/);
		await clearActiveDevloopRun(controller);
	});

	test("begin rejects when a live lease exists on disk under lock", async () => {
		const controller = await beginDevloopRun();
		const lease = await readLeaseFile();
		expect(lease).toBeTruthy();

		_forgetInMemoryRunForTests();

		// Should reject because the lease is still live (own PID is alive).
		await expect(beginDevloopRun()).rejects.toThrow(/already active/);

		await clearActiveDevloopRun(controller);
	});

	test("recover stale lease when PID is dead and lease is old enough", async () => {
		const controller = await beginDevloopRun();
		const lease = (await readLeaseFile())!;

		_forgetInMemoryRunForTests();
		_injectLeaseForTests({
			...lease,
			pid: 99999,
			startedAt: Date.now() - 60_000,
		});

		const stale = await recoverStaleLease();
		expect(stale).toBeTruthy();
		expect(stale!.pid).toBe(99999);

		const newController = await beginDevloopRun();
		expect(hasActiveDevloopRun()).toBe(true);

		await clearActiveDevloopRun(newController);
	});

	test("does not recover a lease younger than the minimum age", async () => {
		_injectLeaseForTests({
			runId: "fresh-run", pid: 99999, sessionOwner: "test",
			repoRoot: "/test", startedAt: Date.now() - 5_000,
		});

		const recovered = await recoverStaleLease();
		expect(recovered).toBeUndefined();
	});

	test("does not recover a lease whose PID is still alive", async () => {
		_injectLeaseForTests({
			runId: "alive-run", pid: process.pid, sessionOwner: "test",
			repoRoot: "/test", startedAt: Date.now() - 60_000,
		});

		const recovered = await recoverStaleLease();
		expect(recovered).toBeUndefined();
	});

	test("compare-and-delete clears only the matching lease", async () => {
		const c1 = await beginDevloopRun();
		const lease1 = (await readLeaseFile())!;
		await clearActiveDevloopRun(c1);

		const c2 = await beginDevloopRun();
		const lease2 = (await readLeaseFile())!;
		expect(lease2.runId).not.toBe(lease1.runId);

		await compareAndDeleteLease(lease1);
		expect(await readLeaseFile()).toBeTruthy(); // lease2 still intact

		await clearActiveDevloopRun(c2);
		expect(await readLeaseFile()).toBeUndefined();
	});

	test("does not let a finished older run clear a newer active run", async () => {
		const first = await beginDevloopRun();
		await clearActiveDevloopRun(first);
		const second = await beginDevloopRun();

		await clearActiveDevloopRun(first);
		expect(hasActiveDevloopRun()).toBe(true);
		expect(second.signal.aborted).toBe(false);

		await clearActiveDevloopRun(second);
	});

	test("reports that no run can be cancelled when idle", () => {
		expect(cancelActiveDevloopRun()).toBeUndefined();
	});

	test("cancel aborts the controller and cleans the lease", async () => {
		const controller = await beginDevloopRun();
		expect(hasActiveDevloopRun()).toBe(true);

		const result = cancelActiveDevloopRun();
		expect(result).toBeTruthy();
		expect(result!.status).toBe("cancelled");
		expect(controller.signal.aborted).toBe(true);

		// Cancellation keeps the lease until the owning run reaches finally.
		expect(await readLeaseFile()).toBeTruthy();
		await clearActiveDevloopRun(controller);
		await result!.completion;
		expect(await readLeaseFile()).toBeUndefined();
	});

	test("register refuses to overwrite a lease owned by another session", async () => {
		await beginDevloopRun();
		const lease = (await readLeaseFile())!;
		_injectLeaseForTests({ ...lease, sessionOwner: "foreign-session" });

		await expect(registerActiveDevloopRun(INFO)).rejects.toThrow(/ownership changed/);
	});

	test("register + get returns the run info", async () => {
		const controller = await beginDevloopRun();
		await registerActiveDevloopRun({ ...INFO, runId: getActiveDevloopRunId()! });
		const info = await getActiveDevloopRun();
		expect(info).toBeTruthy();
		expect(info!.label).toBe("T019");
		expect(info!.worktreePath).toBe(INFO.worktreePath);
		await clearActiveDevloopRun(controller);
		expect(await getActiveDevloopRun()).toBeUndefined();
	});

	test("cancel after extension reload returns still-running status for live PID", async () => {
		const controller = await beginDevloopRun();
		await registerActiveDevloopRun(INFO);
		_forgetInMemoryRunForTests();

		expect(hasActiveDevloopRun()).toBe(true);
		const result = cancelActiveDevloopRun();
		expect(result).toBeTruthy();
		expect(result!.status).toBe("still-running");
		expect(result!.summary).toContain("lost after a reload");

		await result!.completion;
		// Live lease should NOT be cleaned
		expect(await readLeaseFile()).toBeTruthy();

		await clearActiveDevloopRun(controller);
	});

	test("cancel after reload with dead PID returns stale-cleaned", async () => {
		const controller = await beginDevloopRun();
		await registerActiveDevloopRun(INFO);
		const lease = (await readLeaseFile())!;

		_forgetInMemoryRunForTests();
		_injectLeaseForTests({ ...lease, pid: 99999, startedAt: Date.now() - 60_000 });

		const result = cancelActiveDevloopRun();
		expect(result).toBeTruthy();
		expect(result!.status).toBe("stale-cleaned");
		expect(result!.summary).toContain("no longer alive");

		await result!.completion;
		expect(await readLeaseFile()).toBeUndefined();

		await clearActiveDevloopRun(controller);
	});

	test("isPidAlive returns true for own PID", () => {
		expect(isPidAlive(process.pid)).toBe(true);
	});

	test("isPidAlive returns false for non-existent PID", () => {
		expect(isPidAlive(99999)).toBe(false);
	});
});