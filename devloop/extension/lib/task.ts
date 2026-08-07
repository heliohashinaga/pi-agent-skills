export interface TaskDefinition {
	id: string;
	description: string;
	completed?: boolean;
	phase?: number;
	phaseName?: string;
	parallel?: boolean;
	order?: number;
}

export interface TaskDocument {
	tasks: TaskDefinition[];
}

const phaseLine = /^\s*##\s+Phase\s+(\d+)\s*:?\s*(.*?)\s*$/;
const taskLine = /^\s*-\s+\[([ xX])\]\s+(T\d{3})\b\s*(.*)$/;

export function parseTaskDocument(markdown: string): TaskDocument {
	let phase = 0;
	let phaseName = "Unassigned";
	let order = 0;
	const tasks: TaskDefinition[] = [];
	const seen = new Set<string>();

	for (const line of markdown.split(/\r?\n/)) {
		const phaseMatch = line.match(phaseLine);
		if (phaseMatch) {
			phase = Number(phaseMatch[1]);
			phaseName = phaseMatch[2]?.trim() || `Phase ${phase}`;
			continue;
		}

		const taskMatch = line.match(taskLine);
		if (!taskMatch) continue;
		const [, checked, id, description] = taskMatch;
		if (!checked || !id || description === undefined) continue;
		if (seen.has(id)) throw new Error(`Task ${id} appears more than once in tasks.md.`);
		seen.add(id);
		order += 1;
		tasks.push({
			id,
			description: description.trim(),
			completed: checked.toLowerCase() === "x",
			phase,
			phaseName,
			parallel: /^\[P\]\s/.test(description.trim()),
			order,
		});
	}

	return { tasks };
}

function requireTask(document: TaskDocument, taskId: string): TaskDefinition {
	if (!/^T\d{3}$/.test(taskId)) throw new Error(`Invalid task id: ${taskId}.`);
	const task = document.tasks.find((candidate) => candidate.id === taskId);
	if (!task) throw new Error(`Task ${taskId} does not exist in tasks.md.`);
	return task;
}

export function selectIncompleteTask(markdown: string, taskId: string): TaskDefinition {
	const task = requireTask(parseTaskDocument(markdown), taskId);
	if (task.completed) throw new Error(`Task ${taskId} is already completed.`);
	return task;
}

export function selectPhase(document: TaskDocument, phaseNumber: number): TaskDefinition[] {
	if (!Number.isInteger(phaseNumber) || phaseNumber < 1) throw new Error("Invalid phase number.");
	const selected = document.tasks.filter((task) => task.phase === phaseNumber);
	if (selected.length === 0) throw new Error(`Phase ${phaseNumber} does not exist or has no tasks.`);
	return selected;
}

export function selectRange(document: TaskDocument, fromId: string, toId: string): TaskDefinition[] {
	const from = requireTask(document, fromId);
	const to = requireTask(document, toId);
	const fromOrder = from.order ?? 0;
	const toOrder = to.order ?? 0;
	if (fromOrder > toOrder) throw new Error("Task range must start before or at its end.");
	return document.tasks.filter((task) => {
		const order = task.order ?? 0;
		return order >= fromOrder && order <= toOrder;
	});
}

export function markTaskCompleted(markdown: string, taskId: string): string {
	if (!/^T\d{3}$/.test(taskId)) throw new Error(`Invalid task id: ${taskId}.`);
	const taskPattern = new RegExp(`^(\\s*-\\s+)\\[([ xX])\\](\\s+${taskId}\\b.*)$`, "m");
	if (!taskPattern.test(markdown)) throw new Error(`Task ${taskId} does not exist in tasks.md.`);
	return markdown.replace(taskPattern, "$1[x]$3");
}
