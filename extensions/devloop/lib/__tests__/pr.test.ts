import { describe, expect, test } from "bun:test";

import { createPullRequest, type CommandRunner } from "../pr";

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

describe("devloop PR creation", () => {
	test("pushes the head branch and opens a stacked PR against prBase", async () => {
		const { runner, calls } = fakeRunner([
			{ stdout: "", code: 0 }, // git push
			{ stdout: "https://github.com/owner/repo/pull/42\n", code: 0 }, // gh pr create
		]);

		const url = await createPullRequest(runner, {
			repoRoot: "/storybook-ai",
			branch: "devloop/T020-aaa",
			prBase: "main",
			title: "T020: integrate slice",
			body: "Integration of T020.",
		});

		expect(url).toBe("https://github.com/owner/repo/pull/42");
		expect(calls).toEqual([
			{
				command: "git",
				args: ["push", "-u", "origin", "devloop/T020-aaa"],
				cwd: "/storybook-ai",
			},
			{
				command: "gh",
				args: [
					"pr",
					"create",
					"--base",
					"main",
					"--head",
					"devloop/T020-aaa",
					"--title",
					"T020: integrate slice",
					"--body",
					"Integration of T020.",
				],
				cwd: "/storybook-ai",
			},
		]);
	});

	test("omits --body when none is provided", async () => {
		const { runner, calls } = fakeRunner([
			{ stdout: "", code: 0 },
			{ stdout: "https://github.com/owner/repo/pull/7\n", code: 0 },
		]);

		await createPullRequest(runner, {
			repoRoot: "/repo",
			branch: "devloop/T021-bbb",
			prBase: "devloop/T020-aaa",
			title: "T021",
		});

		expect(calls[1]!.args).not.toContain("--body");
		expect(calls[1]!.args).toContain("--base");
		expect(calls[1]!.args).toContain("devloop/T020-aaa");
	});

	test("propagates a failed push or gh call", async () => {
		const { runner } = fakeRunner([{ stderr: "fatal: not a git repository", code: 128 }]);
		await expect(
			createPullRequest(runner, {
				repoRoot: "/repo",
				branch: "devloop/T022",
				prBase: "main",
				title: "T022",
			}),
		).rejects.toThrow(/git push failed/);
	});

	test("rejects an empty PR URL", async () => {
		const { runner } = fakeRunner([{ stdout: "", code: 0 }, { stdout: "  \n", code: 0 }]);
		await expect(
			createPullRequest(runner, {
				repoRoot: "/repo",
				branch: "devloop/T023",
				prBase: "main",
				title: "T023",
			}),
		).rejects.toThrow(/empty URL/);
	});
});
