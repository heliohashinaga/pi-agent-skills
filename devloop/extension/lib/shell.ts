/**
 * Shared command-execution primitives.
 *
 * `CommandRunner` is the seam the whole extension uses to shell out to git/gh:
 * the runtime adapter (`index.ts`) implements it on top of `pi.exec`, and tests
 * inject a fake. Defining the interface + helpers here (once) instead of
 * duplicating them in every shell-using module (`worktree.ts`, `pr.ts`) keeps
 * the contract and the error formatting identical everywhere.
 */

export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

export interface CommandRunner {
	exec(command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal }): Promise<CommandResult>;
}

/** Build a descriptive Error for a failing command, preferring stderr/stdout over a bare exit code. */
export function commandFailure(command: string, result: CommandResult): Error {
	const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
	return new Error(`${command} failed: ${detail}`);
}

/** Throw `commandFailure` unless the result is a success (exit 0); otherwise return it unchanged. */
export function requireSuccess(command: string, result: CommandResult): CommandResult {
	if (result.code !== 0) throw commandFailure(command, result);
	return result;
}

/** Trim trailing/leading whitespace from a command's stdout. */
export function cleanOutput(value: string): string {
	return value.trim();
}
