export type Selection =
	| { mode: "task"; taskId: string }
	| { mode: "phase"; phase: number }
	| { mode: "range"; from: string; to: string };

export interface ParsedArgs {
	selection: Selection;
	dryRun: boolean;
	publish: boolean;
	tasksPath: string | undefined;
	stack: string | undefined;
	stackBase: string | undefined;
}

export function parseArgs(args: string): ParsedArgs {
	const normalized = args.trim().replace(/^\/?devloop\s+/i, "");
	const tokens = normalized.split(/\s+/).filter(Boolean);
	let selection: Selection | undefined;
	let dryRun = false;
	let publish = false;
	let tasksPath: string | undefined;
	let stack: string | undefined;
	let stackBase: string | undefined;

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index] ?? "";
		if (token === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (token === "--pr") {
			publish = true;
			continue;
		}
		if (token === "--tasks") {
			if (index + 1 >= tokens.length) throw new Error("--tasks requires a path argument.");
			tasksPath = tokens[index + 1];
			index += 1;
			continue;
		}
		if (token === "--stack") {
			if (index + 1 >= tokens.length) throw new Error("--stack requires a name.");
			stack = tokens[index + 1];
			index += 1;
			continue;
		}
		if (token === "--stack-base") {
			if (index + 1 >= tokens.length) throw new Error("--stack-base requires a branch.");
			stackBase = tokens[index + 1];
			index += 1;
			continue;
		}
		if (token === "--phase") {
			if (index + 1 >= tokens.length) throw new Error("--phase requires a number.");
			if (selection) throw new Error("Choose only one selection mode: task, phase, or range.");
			const phase = Number(tokens[index + 1]);
			if (!Number.isInteger(phase) || phase < 1) throw new Error("Invalid phase number.");
			selection = { mode: "phase", phase };
			index += 1;
			continue;
		}
		if (token === "--range") {
			if (index + 1 >= tokens.length) throw new Error("--range requires Txxx-Txxx.");
			if (selection) throw new Error("Choose only one selection mode: task, phase, or range.");
			const match = (tokens[index + 1] ?? "").match(/^(T\d{3})-(T\d{3})$/);
			if (!match) throw new Error("Invalid range. Use --range T009-T018.");
			selection = { mode: "range", from: match[1]!, to: match[2]! };
			index += 1;
			continue;
		}
		if (/^T\d{3}$/.test(token)) {
			if (selection) throw new Error("Choose only one selection mode: task, phase, or range.");
			selection = { mode: "task", taskId: token };
			continue;
		}
		throw new Error(`Unknown argument: ${token}.`);
	}

	if (!selection) throw new Error("Usage: /devloop [--dry-run] [--pr] [--stack <name>] [--stack-base <branch>] [--tasks <path>] Txxx | --phase N | --range Txxx-Txxx");
	return { selection, dryRun, publish, tasksPath, stack, stackBase };
}
