import { describe, expect, test } from "bun:test";

import { parseArgs } from "../cli";

describe("devloop CLI parsing", () => {
	test("parses a single task", () => {
		expect(parseArgs("T009")).toEqual({ selection: { mode: "task", taskId: "T009" }, dryRun: false, publish: false, tasksPath: undefined });
		expect(parseArgs("/devloop T010")).toEqual({ selection: { mode: "task", taskId: "T010" }, dryRun: false, publish: false, tasksPath: undefined });
	});

	test("parses a phase and dry-run", () => {
		expect(parseArgs("--phase 2 --dry-run")).toEqual({ selection: { mode: "phase", phase: 2 }, dryRun: true, publish: false, tasksPath: undefined });
	});

	test("parses an inclusive range and tasks path", () => {
		expect(parseArgs("--range T009-T018 --tasks specs/tasks.md")).toEqual({
			selection: { mode: "range", from: "T009", to: "T018" },
			dryRun: false,
			publish: false,
			tasksPath: "specs/tasks.md",
		});
	});

	test("parses an explicit PR opt-in", () => {
		expect(parseArgs("T009 --pr")).toMatchObject({
			selection: { mode: "task", taskId: "T009" },
			publish: true,
		});
	});

	test("parses stack overrides", () => {
		expect(parseArgs("T009 --stack phase-3 --stack-base feat/x")).toMatchObject({
			selection: { mode: "task", taskId: "T009" },
			stack: "phase-3",
			stackBase: "feat/x",
			publish: false,
		});
	});

	test("--stack and --stack-base require their argument", () => {
		expect(() => parseArgs("T009 --stack")).toThrow(/--stack requires a name/);
		expect(() => parseArgs("T009 --stack-base")).toThrow(/--stack-base requires a branch/);
	});

	test("rejects conflicting selection modes", () => {
		expect(() => parseArgs("--phase 2 --range T009-T018")).toThrow(/one selection mode/);
		expect(() => parseArgs("T009 --phase 2")).toThrow(/one selection mode/);
	});

	test("accepts a range syntactically; inversion is validated later at document level", () => {
		// parseArgs only checks format; T018-T009 is valid syntax and is rejected
		// later by selectRange (document order), not by the CLI parser.
		expect(parseArgs("--range T018-T009")).toMatchObject({
			selection: { mode: "range", from: "T018", to: "T009" },
		});
		expect(() => parseArgs("--range 009-018")).toThrow(/Invalid range/);
	});

	test("rejects an invalid phase number", () => {
		expect(() => parseArgs("--phase 0")).toThrow("Invalid phase number");
		expect(() => parseArgs("--phase abc")).toThrow("Invalid phase number");
	});

	test("rejects missing selection", () => {
		expect(() => parseArgs("")).toThrow(/Usage/);
		expect(() => parseArgs("--dry-run")).toThrow(/Usage/);
	});
});
