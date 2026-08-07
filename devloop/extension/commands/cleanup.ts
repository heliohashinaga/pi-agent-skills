import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { getActiveDevloopRun } from "../lib/cancellation";
import { listRetros, removeRetros } from "../lib/retro";
import { listDevloopWorktrees, preflightGitWorkspace, removeDevloopWorktree } from "../lib/worktree";
import { toRunner } from "../lib/run";

/** `/devloop-cleanup` — list or remove devloop worktrees / retrospectives. */
export function registerDevloopCleanup(pi: ExtensionAPI): void {
	pi.registerCommand("devloop-cleanup", {
		description: "List or remove devloop worktrees / retrospectives (usage: /devloop-cleanup [list | remove <branch> | --retros [keep]])",
		handler: async (args, ctx) => {
			const runner = toRunner(pi);
			const tokens = args.trim().split(/\s+/).filter(Boolean);

			if (tokens[0] === "--retros") {
				try {
					const workspace = await preflightGitWorkspace(runner, ctx.cwd);
					const keep =
						tokens[1] !== undefined
							? (() => {
									if (!/^\d+$/.test(tokens[1]!)) throw new Error(`Invalid keep count: '${tokens[1]}'`);
									return Number(tokens[1]);
								})()
							: 0;
					const removed = removeRetros(workspace.repoRoot, keep);
					ctx.ui.notify(`Devloop cleanup removed ${removed} retrospective(s).${keep > 0 ? ` Keeping the ${keep} most recent.` : ""}`, "info");
				} catch (error) {
					ctx.ui.notify(
						`Devloop cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				}
				return;
			}

			if (tokens.length === 0 || tokens[0] === "list") {
				try {
					const workspace = await preflightGitWorkspace(runner, ctx.cwd);
					const entries = await listDevloopWorktrees(runner, workspace.repoRoot);
					if (entries.length === 0) {
						ctx.ui.notify("No devloop worktrees found.", "info");
						return;
					}
					const lines = entries.map(
						(e) => `${e.branch} ${e.dirty ? "(dirty)" : "(clean)"} → ${e.path}`,
					);
					ctx.ui.notify(`Devloop worktrees:\n${lines.join("\n")}`, "info");
				} catch (error) {
					ctx.ui.notify(
						`Devloop cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				}
				return;
			}
			if (tokens[0] === "remove" && tokens[1]) {
				try {
					const workspace = await preflightGitWorkspace(runner, ctx.cwd);
					const activeRun = await getActiveDevloopRun();
					await removeDevloopWorktree(runner, workspace.repoRoot, tokens[1], {
						protectedWorktreePath: activeRun?.worktreePath,
					});
					ctx.ui.notify(`Devloop worktree "${tokens[1]}" removed.`, "info");
				} catch (error) {
					ctx.ui.notify(
						`Devloop cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				}
				return;
			}
			ctx.ui.notify("Usage: /devloop-cleanup [list | remove <devloop/branch> | --retros [keep]]", "warning");
		},
	});
}
