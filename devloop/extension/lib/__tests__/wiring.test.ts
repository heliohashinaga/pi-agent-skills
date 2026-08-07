import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	_resetCancellationForTests,
	_setLeaseDirForTests,
	beginDevloopRun,
	clearActiveDevloopRun,
	getActiveDevloopRunId,
} from "../cancellation";
import devloopExtension from "../../index";
import { fakeExtensionApi } from "./_fakes";

describe("devloop wiring (ExtensionAPI fake)", () => {
	let testDir: string;

	beforeAll(() => {
		testDir = mkdtempSync(path.join(tmpdir(), "devloop-wiring-"));
		_setLeaseDirForTests(testDir);
	});

	afterAll(async () => {
		await _resetCancellationForTests();
	});


	test("registers all five commands", () => {
		const { pi } = fakeExtensionApi();
		devloopExtension(pi);
		const names = Object.keys(pi.commands);
		expect(names.sort()).toEqual([
			"devloop",
			"devloop-cleanup",
			"devloop-retro",
			"devloop-smoke",
			"devloop-stop",
		]);
	});


	test("session_start installs DevloopInterruptEditor", () => {
		const { pi, ctx, sessionStartHandlers, editorFactory } = fakeExtensionApi();
		devloopExtension(pi);

		expect(sessionStartHandlers.length).toBe(1);
		sessionStartHandlers[0]!("session_start", ctx);

		expect(editorFactory.current).not.toBeNull();
	});


	test("notify called on lifecycle (run already active)", async () => {
		const { pi, ctx, notifyCalls, commands } = fakeExtensionApi();
		devloopExtension(pi);

		const controller = await beginDevloopRun();
		try {
			await commands["devloop"]!.handler("T001", ctx);
			expect(notifyCalls.length).toBe(1);
			expect(notifyCalls[0]!.message).toContain("already in progress");
			expect(notifyCalls[0]!.level).toBe("warning");
		} finally {
			await clearActiveDevloopRun(controller);
		}
	});


	test("/devloop-stop notifies when nothing is running", async () => {
		const { pi, ctx, commands, notifyCalls } = fakeExtensionApi();
		devloopExtension(pi);

		await commands["devloop-stop"]!.handler("", ctx);
		expect(notifyCalls.length).toBe(1);
		expect(notifyCalls[0]!.message).toContain("No devloop run is active");
		expect(notifyCalls[0]!.level).toBe("info");
	});
});
