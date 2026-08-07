import path from "node:path";

export interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

export interface CommandRunner {
	exec(command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal }): Promise<CommandResult>;
}

export interface GitWorkspace {
	repoRoot: string;
	baseBranch: string;
}

export interface WorktreeRequest {
	repoRoot: string;
	taskId: string;
	runId: string;
	label?: string;
	/**
	 * Commit/branch the new devloop branch is created from. Omit to default to
	 * `HEAD` (current behavior); pass the chain tip to stack runs.
	 */
	startCommit?: string;
}

export interface WorktreeHandle {
	branch: string;
	path: string;
}

function commandFailure(command: string, result: CommandResult): Error {
	const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
	return new Error(`${command} failed: ${detail}`);
}

function requireSuccess(command: string, result: CommandResult): CommandResult {
	if (result.code !== 0) throw commandFailure(command, result);
	return result;
}

function cleanOutput(value: string): string {
	return value.trim();
}

export async function preflightGitWorkspace(runner: CommandRunner, cwd: string, signal?: AbortSignal): Promise<GitWorkspace> {
	const root = requireSuccess(
		"git rev-parse --show-toplevel",
		await runner.exec("git", ["rev-parse", "--show-toplevel"], { cwd, signal }),
	);
	const repoRoot = cleanOutput(root.stdout);
	if (!repoRoot) throw new Error("Git preflight failed: repository root was empty.");

	const status = requireSuccess(
		"git status --porcelain",
		await runner.exec("git", ["status", "--porcelain"], { cwd: repoRoot, signal }),
	);
	if (cleanOutput(status.stdout)) {
		throw new Error("Devloop cannot start: working tree is not clean.");
	}

	const branch = requireSuccess(
		"git branch --show-current",
		await runner.exec("git", ["branch", "--show-current"], { cwd: repoRoot, signal }),
	);
	const baseBranch = cleanOutput(branch.stdout);
	if (!baseBranch) throw new Error("Devloop cannot start from a detached HEAD.");

	return { repoRoot, baseBranch };
}

export async function createWorktree(
	runner: CommandRunner,
	request: WorktreeRequest,
	signal?: AbortSignal,
): Promise<WorktreeHandle> {
	if (!/^T\d{3}$/.test(request.taskId)) throw new Error("Invalid devloop task id.");
	if (!/^[a-z0-9-]+$/i.test(request.runId)) throw new Error("Invalid devloop run id.");
	if (request.label && !/^[a-z0-9-]+$/i.test(request.label)) throw new Error("Invalid devloop worktree label.");

	const repositoryName = path.basename(request.repoRoot);
	const suffix = `${request.label ?? request.taskId}-${request.runId}`;
	const branch = `devloop/${suffix}`;
	const worktreePath = path.join(path.dirname(request.repoRoot), `${repositoryName}-devloop-${suffix}`);
	const startPoint = request.startCommit ?? "HEAD";
	const result = await runner.exec(
		"git",
		["worktree", "add", "-b", branch, worktreePath, startPoint],
		{ cwd: request.repoRoot, signal },
	);
	requireSuccess("git worktree add", result);

	return { branch, path: worktreePath };
}

// --- Devloop worktree lifecycle ---

/**
 * List worktrees that match the devloop naming convention. Only worktrees
 * with a branch named `devloop/*` are listed — never arbitrary worktrees.
 */
export interface DevloopWorktreeEntry {
	branch: string;
	path: string;
	head: string;
	dirty: boolean;
}

export async function listDevloopWorktrees(
	runner: CommandRunner,
	repoRoot: string,
	signal?: AbortSignal,
): Promise<DevloopWorktreeEntry[]> {
	const result = await runner.exec("git", ["worktree", "list", "--porcelain"], {
		cwd: repoRoot,
		signal,
	});
	requireSuccess("git worktree list", result);

	const entries: DevloopWorktreeEntry[] = [];
	let current: Partial<DevloopWorktreeEntry> = {};

	for (const line of result.stdout.split(/\r?\n/)) {
		if (line.startsWith("worktree ")) {
			current = { path: line.slice("worktree ".length) };
		} else if (line.startsWith("HEAD ")) {
			current.head = line.slice("HEAD ".length);
		} else if (line.startsWith("branch ")) {
			current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
		} else if (line === "" && current.branch?.startsWith("devloop/")) {
			// Check dirty status.
			const status = requireSuccess(
				"git status --porcelain",
				await runner.exec("git", ["status", "--porcelain"], {
					cwd: current.path,
					signal,
				}),
			);
			current.dirty = status.stdout.trim().length > 0;
			entries.push(current as DevloopWorktreeEntry);
			current = {};
		}
	}

	return entries;
}

/**
 * Safely remove a devloop worktree. Only accepts worktrees whose branch name
 * starts with `devloop/`. Refuses to remove dirty worktrees (to prevent data
 * loss). The branch is always preserved (never force-deleted). If git worktree
 * remove fails, the error propagates — no swallow, no fallback.
 */
export async function removeDevloopWorktree(
	runner: CommandRunner,
	repoRoot: string,
	branch: string,
	options?: { signal?: AbortSignal; protectedWorktreePath?: string },
): Promise<void> {
	if (!branch.startsWith("devloop/")) {
		throw new Error(
			`Refusing to remove worktree "${branch}": not a devloop worktree (branch must start with "devloop/").`,
		);
	}

	// Verify the worktree exists and is clean.
	const list = await listDevloopWorktrees(runner, repoRoot, options?.signal);
	const entry = list.find((e) => e.branch === branch);
	if (!entry) {
		throw new Error(`Devloop worktree "${branch}" not found.`);
	}

	if (options?.protectedWorktreePath && path.resolve(entry.path) === path.resolve(options.protectedWorktreePath)) {
		throw new Error(`Refusing to remove active devloop worktree "${branch}" at ${entry.path}.`);
	}

	if (entry.dirty) {
		throw new Error(
			`Refusing to remove dirty worktree "${branch}" at ${entry.path}. Commit or otherwise recover the work first.`,
		);
	}

	// git worktree remove cleans the directory. Branch is always preserved.
	// We never force-delete branches (no -D). If this fails, let the error propagate.
	const result = await runner.exec(
		"git",
		["worktree", "remove", entry.path],
		{ cwd: repoRoot, signal: options?.signal },
	);
	requireSuccess("git worktree remove", result);
}
