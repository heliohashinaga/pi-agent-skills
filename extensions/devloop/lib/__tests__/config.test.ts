import { describe, expect, test } from "bun:test";

import {
	parseDevloopConfig,
	resolveStageTimeoutMs,
	resolveTasksPath,
	TERMINAL_RESPONSE_GRACE_MS,
	withTerminalResponseGrace,
} from "../config";

describe("devloop tasks path resolution", () => {
	test("flags win over config and defaults", () => {
		const config = parseDevloopConfig("{\"tasksPath\":\"cfg.md\"}");
		const result = resolveTasksPath("/repo", "custom/tasks.md", config, () => false);
		expect(result).toBe("/repo/custom/tasks.md");
	});

	test("config is used when no flag is given", () => {
		const config = parseDevloopConfig("{\"tasksPath\":\"specs/mine.md\"}");
		const result = resolveTasksPath("/repo", undefined, config, () => false);
		expect(result).toBe("/repo/specs/mine.md");
	});

	test("uses the default child timeout plus a terminal-response grace period", () => {
		const timeout = resolveStageTimeoutMs("planner", undefined);
		expect(timeout).toBe(300_000);
		expect(TERMINAL_RESPONSE_GRACE_MS).toBeGreaterThan(0);
		expect(withTerminalResponseGrace(timeout)).toBe(315_000);
	});

	test("uses a validated per-stage timeout override", () => {
		const config = parseDevloopConfig('{"stageTimeoutMs":{"planner":600000}}');
		expect(resolveStageTimeoutMs("planner", config)).toBe(600_000);
		expect(resolveStageTimeoutMs("test", config)).toBe(300_000);
	});

	test("rejects an invalid per-stage timeout configuration", () => {
		expect(() => parseDevloopConfig('{"stageTimeoutMs":{"planner":0}}')).toThrow(/planner|positive integer/i);
		expect(() => parseDevloopConfig('{"stageTimeoutMs":{"unknown":600000}}')).toThrow(/unknown stage/i);
	});

	test("falls back to the first conventional candidate that exists", () => {
		const existing = (candidate: string) => candidate === "tasks.md";
		const result = resolveTasksPath("/repo", undefined, undefined, existing);
		expect(result).toBe("/repo/tasks.md");
	});

	test("throws a clear error when nothing is found", () => {
		expect(() => resolveTasksPath("/repo", undefined, undefined, () => false)).toThrow(
			/devloop.json|--tasks/,
		);
	});
});

describe("devloop stack + worktree config", () => {
	test("parses stack name and base", () => {
		const config = parseDevloopConfig('{"stack":{"name":"phase-3","base":"main"}}');
		expect(config?.stack).toEqual({ name: "phase-3", base: "main" });
	});

	test("stack defaults are absent when not configured", () => {
		const config = parseDevloopConfig("{\"tasksPath\":\"tasks.md\"}");
		expect(config?.stack).toBeUndefined();
	});

	test("parses keepWorktreeOnSuccess boolean", () => {
		expect(parseDevloopConfig("{\"keepWorktreeOnSuccess\":false}")?.keepWorktreeOnSuccess).toBe(false);
		expect(parseDevloopConfig("{\"keepWorktreeOnSuccess\":true}")?.keepWorktreeOnSuccess).toBe(true);
	});

	test("keepWorktreeOnSuccess is absent when not configured", () => {
		expect(parseDevloopConfig("{\"tasksPath\":\"tasks.md\"}")?.keepWorktreeOnSuccess).toBeUndefined();
	});

	test("rejects an invalid stack or keepWorktreeOnSuccess configuration", () => {
		expect(() => parseDevloopConfig('{"stack":"not-an-object"}')).toThrow(/stack/);
		expect(() => parseDevloopConfig('{"stack":{"name":42}}')).toThrow(/stack.name/);
		expect(() => parseDevloopConfig('{"stack":{"base":42}}')).toThrow(/stack.base/);
		expect(() => parseDevloopConfig('{"keepWorktreeOnSuccess":"yes"}')).toThrow(/keepWorktreeOnSuccess/);
	});
});

describe("devloop retro config", () => {
	test("parses retro.recommend boolean", () => {
		expect(parseDevloopConfig('{"retro":{"recommend":true}}')?.retro).toEqual({ recommend: true });
		expect(parseDevloopConfig('{"retro":{"recommend":false}}')?.retro).toEqual({ recommend: false });
	});

	test("retro is absent when not configured", () => {
		expect(parseDevloopConfig("{\"tasksPath\":\"tasks.md\"}")?.retro).toBeUndefined();
	});

	test("rejects an invalid retro configuration", () => {
		expect(() => parseDevloopConfig('{"retro":"not-an-object"}')).toThrow(/retro/);
		expect(() => parseDevloopConfig('{"retro":{"recommend":"yes"}}')).toThrow(/retro\.recommend/);
	});
});
