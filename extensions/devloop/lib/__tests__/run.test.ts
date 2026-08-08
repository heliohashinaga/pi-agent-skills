import { describe, expect, test } from "bun:test";

import { selectionLabel, toRunner } from "../run";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Selection } from "../cli";

/**
 * Unit tests for the pure helpers extracted into lib/run.ts. The full
 * `runDevloop` orchestration (git worktree + agent preflight + delegation) is
 * an integration test best written against the typed fake ExtensionAPI built
 * in Fase 5 (it needs `resolveSubagentLaunchContract` mocked); these cover the
 * deterministic seams now.
 */

describe("devloop run helpers", () => {
	test("selectionLabel formats each selection mode", () => {
		const task: Selection = { mode: "task", taskId: "T009" };
		expect(selectionLabel(task)).toBe("T009");

		const phase: Selection = { mode: "phase", phase: 3 };
		expect(selectionLabel(phase)).toBe("phase-3");

		const range: Selection = { mode: "range", from: "T009", to: "T018" };
		expect(selectionLabel(range)).toBe("T009-T018");
	});

	test("toRunner adapts the pi exec surface to CommandRunner", async () => {
		let capturedCommand: string | undefined;
		let capturedArgs: string[] | undefined;
		let capturedOptions: unknown | undefined;
		const pi = {
			exec: async (command: string, args: string[], options: unknown) => {
				capturedCommand = command;
				capturedArgs = args;
				capturedOptions = options;
				return { code: 0, stdout: "out\n", stderr: "" };
			},
		} as unknown as ExtensionAPI;

		const runner = toRunner(pi);
		const result = await runner.exec("git", ["status", "--porcelain"], { cwd: "/repo" });

		expect(capturedCommand).toBe("git");
		expect(capturedArgs).toEqual(["status", "--porcelain"]);
		expect(capturedOptions).toEqual({ cwd: "/repo" });
		expect(result).toEqual({ code: 0, stdout: "out\n", stderr: "" });
	});

	test("toRunner preserves non-zero exit codes and stderr", async () => {
		const pi = {
			exec: async () => ({ code: 1, stdout: "", stderr: "boom" }),
		} as unknown as ExtensionAPI;
		const runner = toRunner(pi);
		const result = await runner.exec("gh", ["pr", "create"]);
		expect(result.code).toBe(1);
		expect(result.stderr).toBe("boom");
		// toRunner is a pure adapter; it does not throw on non-zero — callers decide.
		expect(typeof result.code).toBe("number");
	});
});
