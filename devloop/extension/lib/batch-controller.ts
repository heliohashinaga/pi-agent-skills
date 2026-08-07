import type { ExecutionPlan } from "./scheduler";
import type { TaskDefinition } from "./task";

export interface TaskRunOutput {
	status: "ready-to-merge" | "human-escalation";
	reason: string;
}

export interface BatchControllerDeps {
	plan: ExecutionPlan;
	runTask: (task: TaskDefinition) => Promise<TaskRunOutput>;
}

export interface BatchResult {
	status: "ready-to-merge" | "human-escalation";
	reason: string;
	completed: string[];
	pending: string[];
	failedTask?: string;
}

/**
 * Runs every selected pending task sequentially. The controller (via the
 * gate) owns task-tracking commits — the batch controller does
 * NOT mark tasks complete.
 */
export async function runBatchController(deps: BatchControllerDeps): Promise<BatchResult> {
	const completed = [...deps.plan.completed];
	const pending = [...deps.plan.pendingIds];

	if (deps.plan.blockedBy.length > 0) {
		return {
			status: "human-escalation",
			reason: `Batch is blocked by incomplete prerequisites: ${deps.plan.blockedBy.join(", ")}.`,
			completed,
			pending,
		};
	}

	for (const task of deps.plan.tasks) {
		const output = await deps.runTask(task);
		if (output.status !== "ready-to-merge") {
			return {
				status: "human-escalation",
				reason: output.reason,
				completed,
				pending: pending.filter((id) => !completed.includes(id)),
				failedTask: task.id,
			};
		}

		completed.push(task.id);
	}

	return {
		status: "ready-to-merge",
		reason: "All selected tasks passed their gates.",
		completed,
		pending: [],
	};
}