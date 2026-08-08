import { describe, expect, test } from "bun:test";

import {
	createWorktree,
	listDevloopWorktrees,
	preflightGitWorkspace,
	removeDevloopWorktree,
	type CommandRunner,
} from "../worktree";

interface Call {
	command: string;
	args: string[];
	cwd?: string;
}

function fakeRunner(results: Array<{ stdout?: string; stderr?: string; code?: number }>): {
	runner: CommandRunner;
	calls: Call[];
} {
	const calls: Call[] = [];
	return {
		calls,
		runner: {
			exec: async (command, args, options) => {
				calls.push({ command, args: [...args], cwd: options?.cwd });
				const next = results.shift();
				if (!next) throw new Error("Unexpected command.");
				return { stdout: next.stdout ?? "", stderr: next.stderr ?? "", code: next.code ?? 0 };
			},
		},
	};
}

describe("devloop worktree preflight", () => {
	test("accepts a clean branch-backed Git workspace", async () => {
		const { runner } = fakeRunner([
			{ stdout: "/storybook-ai\n" },
			{ stdout: "" },
			{ stdout: "main\n" },
		]);

		await expect(preflightGitWorkspace(runner, "/storybook-ai")).resolves.toEqual({
			repoRoot: "/storybook-ai",
			baseBranch: "main",
		});
	});

	test("rejects a dirty workspace before any writer work begins", async () => {
		const { runner } = fakeRunner([
			{ stdout: "/storybook-ai\n" },
			{ stdout: " M src/app.ts\n" },
		]);

		await expect(preflightGitWorkspace(runner, "/storybook-ai")).rejects.toThrow("working tree is not clean");
	});
});

describe("devloop worktree creation", () => {
	test("creates a dedicated branch and worktree from HEAD", async () => {
		const { runner, calls } = fakeRunner([{ stdout: "", code: 0 }]);

		const worktree = await createWorktree(runner, {
			repoRoot: "/storybook-ai",
			taskId: "T009",
			runId: "ab12cd34",
		});

		expect(worktree.branch).toBe("devloop/T009-ab12cd34");
		expect(worktree.path).toBe("/storybook-ai-devloop-T009-ab12cd34");
		expect(calls).toEqual([
			{
				command: "git",
				args: [
					"worktree",
					"add",
					"-b",
					"devloop/T009-ab12cd34",
					"/storybook-ai-devloop-T009-ab12cd34",
					"HEAD",
				],
				cwd: "/storybook-ai",
			},
		]);
	});

	test("creates the branch from an explicit startCommit (chain tip)", async () => {
		const { runner, calls } = fakeRunner([{ stdout: "", code: 0 }]);

		const worktree = await createWorktree(runner, {
			repoRoot: "/storybook-ai",
			taskId: "T010",
			runId: "ef56gh78",
			startCommit: "devloop/T009-ab12cd34",
		});

		expect(worktree.branch).toBe("devloop/T010-ef56gh78");
		expect(worktree.path).toBe("/storybook-ai-devloop-T010-ef56gh78");
		expect(calls).toEqual([
			{
				command: "git",
				args: [
					"worktree",
					"add",
					"-b",
					"devloop/T010-ef56gh78",
					"/storybook-ai-devloop-T010-ef56gh78",
					"devloop/T009-ab12cd34",
				],
				cwd: "/storybook-ai",
			},
		]);
	});
});

describe("devloop worktree cleanup", () => {
	test("listDevloopWorktrees returns only devloop/ branches", async () => {
		const { runner } = fakeRunner([
			{
				stdout:
					"worktree /home/repo\nHEAD abc123\nbranch refs/heads/main\n\n" +
					"worktree /home/repo-devloop-T009-x\nHEAD def456\nbranch refs/heads/devloop/T009-x\n\n",
			},
			{ stdout: "" }, // git status --porcelain (clean)
		]);

		const entries = await listDevloopWorktrees(runner, "/home/repo");
		expect(entries).toHaveLength(1);
		expect(entries[0]!.branch).toBe("devloop/T009-x");
		expect(entries[0]!.dirty).toBe(false);
	});

	test("listDevloopWorktrees detects dirty worktrees", async () => {
		const { runner } = fakeRunner([
			{
				stdout:
					"worktree /home/repo-devloop-T010-x\nHEAD ghi789\nbranch refs/heads/devloop/T010-x\n\n",
			},
			{ stdout: " M src/app.ts\n" }, // dirty
		]);

		const entries = await listDevloopWorktrees(runner, "/home/repo");
		expect(entries).toHaveLength(1);
		expect(entries[0]!.dirty).toBe(true);
	});

	test("removeDevloopWorktree refuses non-devloop branch", async () => {
		const { runner } = fakeRunner([]);
		await expect(removeDevloopWorktree(runner, "/home/repo", "feature/foo")).rejects.toThrow(
			/not a devloop worktree/,
		);
	});

	test("removeDevloopWorktree refuses dirty worktrees by default", async () => {
		const { runner } = fakeRunner([
			{
				stdout:
					"worktree /home/repo-devloop-T009-x\nHEAD def456\nbranch refs/heads/devloop/T009-x\n\n",
			},
			{ stdout: " M src/app.ts\n" }, // dirty
		]);

		await expect(removeDevloopWorktree(runner, "/home/repo", "devloop/T009-x")).rejects.toThrow(
			/dirty/,
		);
	});

	test("removeDevloopWorktree refuses a clean worktree owned by the active lease", async () => {
		const activePath = "/home/repo-devloop-T009-x";
		const { runner } = fakeRunner([
			{
				stdout:
					`worktree ${activePath}\nHEAD def456\nbranch refs/heads/devloop/T009-x\n\n`,
			},
			{ stdout: "" },
		]);

		await expect(removeDevloopWorktree(runner, "/home/repo", "devloop/T009-x", {
			protectedWorktreePath: activePath,
		})).rejects.toThrow(/active devloop worktree/);
	});

	test("removeDevloopWorktree removes a clean worktree without touching the branch", async () => {
		const { runner, calls } = fakeRunner([
			{
				stdout:
					"worktree /home/repo-devloop-T009-x\nHEAD def456\nbranch refs/heads/devloop/T009-x\n\n",
			},
			{ stdout: "" }, // clean
			{ stdout: "", code: 0 }, // git worktree remove
		]);

		await removeDevloopWorktree(runner, "/home/repo", "devloop/T009-x");
		expect(calls.some((c) => c.command === "git" && c.args[0] === "worktree" && c.args[1] === "remove")).toBe(true);
		// Never branch -D
		expect(calls.some((c) => c.args.includes("-D"))).toBe(false);
	});
});