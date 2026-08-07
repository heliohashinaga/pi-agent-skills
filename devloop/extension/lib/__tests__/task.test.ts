import { describe, expect, test } from "bun:test";

import {
	markTaskCompleted,
	parseTaskDocument,
	selectIncompleteTask,
	selectPhase,
	selectRange,
} from "../task";

const tasks = `
## Phase 1: Setup
- [x] T008 Completed setup task.

## Phase 2: Foundational
- [ ] T009 [P] Write failing age-band validation tests.
- [ ] T010 Implement age-band schema.
- [x] T011 Completed foundational task.

## Phase 3: MVP
- [ ] T012 Build the route.
`;

describe("devloop task selection", () => {
	test("returns the exact unchecked task", () => {
		expect(selectIncompleteTask(tasks, "T009")).toMatchObject({
			id: "T009",
			description: "[P] Write failing age-band validation tests.",
			phase: 2,
		});
	});

	test("parses phase metadata and parallel markers", () => {
		const document = parseTaskDocument(tasks);
		const task = document.tasks.find((candidate) => candidate.id === "T009");

		expect(task).toMatchObject({ phase: 2, phaseName: "Foundational", parallel: true, order: 2 });
		expect(document.tasks.find((candidate) => candidate.id === "T012")).toMatchObject({ phase: 3 });
	});

	test("selects all tasks belonging to a phase", () => {
		expect(selectPhase(parseTaskDocument(tasks), 2).map((task) => task.id)).toEqual(["T009", "T010", "T011"]);
	});

	test("selects an inclusive task range", () => {
		expect(selectRange(parseTaskDocument(tasks), "T009", "T011").map((task) => task.id)).toEqual([
			"T009",
			"T010",
			"T011",
		]);
	});

	test("marks only the requested task complete", () => {
		expect(markTaskCompleted(tasks, "T009")).toContain("- [x] T009 [P] Write failing age-band validation tests.");
		expect(markTaskCompleted(tasks, "T009")).toContain("- [ ] T010 Implement age-band schema.");
	});

	test("rejects an unknown task id", () => {
		expect(() => selectIncompleteTask(tasks, "T999")).toThrow("does not exist");
	});

	test("rejects an already completed task", () => {
		expect(() => selectIncompleteTask(tasks, "T008")).toThrow("already completed");
	});

	test("rejects a malformed task id", () => {
		expect(() => selectIncompleteTask(tasks, "009")).toThrow("Invalid task id");
	});

	test("rejects an inverted range", () => {
		expect(() => selectRange(parseTaskDocument(tasks), "T011", "T009")).toThrow("range must start");
	});
});
