import { describe, expect, test } from "bun:test";

import { runBatchController } from "../batch-controller";
import { parseTaskDocument, selectPhase } from "../task";
import { buildExecutionPlan } from "../scheduler";

const tasks = `
## Phase 2: Foundational
- [ ] T009 First task.
- [ ] T010 Second task.
`;

describe("devloop batch controller", () => {
	test("runs tasks sequentially and tracks completed ids", async () => {
		const document = parseTaskDocument(tasks);
		const plan = buildExecutionPlan(document, selectPhase(document, 2));
		const ran: string[] = [];

		const result = await runBatchController({
			plan,
			runTask: async (task) => {
				ran.push(task.id);
				return { status: "ready-to-merge", reason: "all gates passed" };
			},
		});

		expect(result.status).toBe("ready-to-merge");
		expect(ran).toEqual(["T009", "T010"]);
		expect(result.completed).toEqual(["T009", "T010"]);
	});

	test("stops at the first human escalation and leaves later tasks pending", async () => {
		const document = parseTaskDocument(tasks);
		const plan = buildExecutionPlan(document, selectPhase(document, 2));
		const ran: string[] = [];

		const result = await runBatchController({
			plan,
			runTask: async (task) => {
				ran.push(task.id);
				return task.id === "T009"
					? { status: "human-escalation", reason: "retry limit exhausted" }
					: { status: "ready-to-merge", reason: "unused" };
			},
		});

		expect(result.status).toBe("human-escalation");
		expect(result.failedTask).toBe("T009");
		expect(ran).toEqual(["T009"]);
		expect(result.pending).toEqual(["T009", "T010"]);
	});

	test("reports scheduler blockers without invoking a worker", async () => {
		const blockedTasks = `
## Phase 2: Foundational
- [ ] T009 First task.
- [ ] T010 Second task.
`;
		const document = parseTaskDocument(blockedTasks);
		const plan = buildExecutionPlan(document, selectPhase(document, 2));
		let invoked = false;

		const result = await runBatchController({
			plan: { ...plan, tasks: [], pendingIds: ["T009", "T010"], blockedBy: ["T008"] },
			runTask: async () => {
				invoked = true;
				return { status: "ready-to-merge", reason: "unexpected" };
			},
		});

		expect(result.status).toBe("human-escalation");
		expect(result.pending).toEqual(["T009", "T010"]);
		expect(result.reason).toContain("T008");
		expect(invoked).toBe(false);
	});
});