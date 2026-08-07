import type { TaskDefinition, TaskDocument } from "./task";

export interface ExecutionPlan {
	tasks: TaskDefinition[];
	completed: string[];
	pendingIds: string[];
	blockedBy: string[];
}

/**
 * Build a conservative sequential plan. The task document has no machine-readable
 * dependency graph, so every incomplete task before the selected queue is treated
 * as a prerequisite. This prevents a range from silently skipping foundational work.
 */
export function buildExecutionPlan(document: TaskDocument, selected: TaskDefinition[]): ExecutionPlan {
	if (selected.length === 0) throw new Error("Task selection is empty.");

	const selectedIds = new Set(selected.map((task) => task.id));
	const ordered = [...selected].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const firstOrder = ordered[0]?.order ?? 0;
	const prerequisites = document.tasks.filter((task) => (task.order ?? 0) < firstOrder && !task.completed);
	const selectedPending = ordered.filter((task) => !task.completed);
	const blockedBy = prerequisites.map((task) => task.id);

	const pendingIds = ordered.filter((task) => !task.completed).map((task) => task.id);
	if (blockedBy.length > 0) {
		return {
			tasks: [],
			completed: ordered.filter((task) => task.completed).map((task) => task.id),
			pendingIds,
			blockedBy,
		};
	}

	const executable: TaskDefinition[] = [];
	for (const task of selectedPending) {
		// The queue is intentionally sequential; all selected pending tasks are
		// executable in order once external prerequisites are complete.
		executable.push(task);
	}

	return {
		tasks: executable,
		completed: ordered.filter((task) => task.completed).map((task) => task.id),
		pendingIds,
		blockedBy: [],
	};
}
