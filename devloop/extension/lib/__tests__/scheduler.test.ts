import { describe, expect, test } from "bun:test";

import { parseTaskDocument, selectPhase, selectRange } from "../task";
import { buildExecutionPlan } from "../scheduler";

const tasks = `
## Phase 1: Setup
- [x] T008 Setup complete.

## Phase 2: Foundational
- [ ] T009 First task.
- [ ] T010 Second task.
- [x] T011 Already complete.

## Phase 3: MVP
- [ ] T012 Later task.
`;

describe("devloop scheduler", () => {
	test("plans pending phase tasks in document order", () => {
		const document = parseTaskDocument(tasks);
		const plan = buildExecutionPlan(document, selectPhase(document, 2));

		expect(plan.tasks.map((task) => task.id)).toEqual(["T009", "T010"]);
		expect(plan.completed).toEqual(["T011"]);
		expect(plan.blockedBy).toEqual([]);
	});

	test("reports an incomplete prerequisite outside a range", () => {
		const markdown = tasks.replace("- [x] T008 Setup complete.", "- [ ] T008 Setup complete.");
		const document = parseTaskDocument(markdown);
		const plan = buildExecutionPlan(document, selectRange(document, "T009", "T010"));

		expect(plan.tasks).toEqual([]);
		expect(plan.blockedBy).toEqual(["T008"]);
	});

	test("does not run a later task when an earlier selected task is pending", () => {
		const document = parseTaskDocument(tasks);
		const plan = buildExecutionPlan(document, selectRange(document, "T010", "T011"));

		expect(plan.tasks).toEqual([]);
		expect(plan.blockedBy).toEqual(["T009"]);
	});

	test("rejects an empty selection", () => {
		const document = parseTaskDocument(tasks);
		expect(() => buildExecutionPlan(document, [])).toThrow("selection is empty");
	});
});
