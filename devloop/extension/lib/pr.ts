export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

export interface CommandRunner {
	exec(command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal }): Promise<CommandResult>;
}

export interface CreatePrOptions {
	repoRoot: string;
	/** Head branch for the PR (pushed by this helper). */
	branch: string;
	/** The branch this PR targets (previous devloop branch or stack base). */
	prBase: string;
	title: string;
	body?: string;
}

function commandFailure(command: string, result: CommandResult): Error {
	const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
	return new Error(`${command} failed: ${detail}`);
}

function requireSuccess(command: string, result: CommandResult): CommandResult {
	if (result.code !== 0) throw commandFailure(command, result);
	return result;
}

/**
 * Push the head branch and open a PR (stacked-PR target = `prBase`). Never
 * merges. Returns the PR URL parsed from `gh` stdout.
 */
export async function createPullRequest(
	runner: CommandRunner,
	options: CreatePrOptions,
	signal?: AbortSignal,
): Promise<string> {
	const push = await runner.exec("git", ["push", "-u", "origin", options.branch], {
		cwd: options.repoRoot,
		signal,
	});
	requireSuccess("git push", push);

	const args = [
		"pr",
		"create",
		"--base",
		options.prBase,
		"--head",
		options.branch,
		"--title",
		options.title,
	];
	if (options.body) args.push("--body", options.body);
	const result = await runner.exec("gh", args, { cwd: options.repoRoot, signal });
	requireSuccess("gh pr create", result);
	const url = result.stdout.trim();
	if (!url) throw new Error("gh pr create returned an empty URL.");
	return url;
}
