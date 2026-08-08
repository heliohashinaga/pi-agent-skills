import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { RETRO_ENTRY_TYPE, type RetroCardData } from "../lib/cards";
import { listRetros, readRetro } from "../lib/retro";
import { runRetroAnalysis } from "../lib/retro-agent";
import { preflightGitWorkspace } from "../lib/worktree";
import { toRunner } from "../lib/run";

/** `/devloop-retro` — list or read devloop run retrospectives. */
export function registerDevloopRetro(pi: ExtensionAPI): void {
	pi.registerCommand("devloop-retro", {
		description: "List or read devloop run retrospectives (usage: /devloop-retro [runId] [--agent])",
		handler: async (args, ctx) => {
			const runner = toRunner(pi);
			const tokens = args.trim().split(/\s+/).filter((t) => t);
			const wantsAgent = tokens.includes("--agent");
			const runId = tokens.find((t) => t !== "--agent");
			try {
				const workspace = await preflightGitWorkspace(runner, ctx.cwd);
				if (!runId) {
					const retros = listRetros(workspace.repoRoot);
					if (retros.length === 0) {
						ctx.ui.notify("No devloop retrospectives found yet. Run /devloop first.", "info");
						return;
					}
					const lines = retros.map(
						(r) => `${r.runId} · ${r.label} · ${r.branch ?? "?"} · ${r.status ?? "?"}`,
					);
					ctx.ui.notify(`Devloop retrospectives:\n${lines.join("\n")}`, "info");
					return;
				}
				if (wantsAgent) {
					await runRetroAnalysis(pi, ctx, workspace.repoRoot, runId);
					ctx.ui.notify(`Devloop retrospective for ${runId} updated with recommendations.`, "info");
					return;
				}
				const metrics = readRetro(runId, workspace.repoRoot);
				if (!metrics) {
					ctx.ui.notify(`No devloop retrospective found for ${runId}. Run /devloop-retro to list.`, "warning");
					return;
				}
				const card: RetroCardData = {
					runId: metrics.meta.runId,
					label: metrics.meta.label,
					status: metrics.aggregate.runStatus,
					reason: metrics.aggregate.reason,
					totalDurationMs: metrics.aggregate.totalDurationMs,
					totalTokens: metrics.aggregate.totalTokens,
					totalToolCalls: metrics.aggregate.totalToolCalls,
					retries: metrics.aggregate.retries,
					escalations: metrics.aggregate.escalations,
					stageCount: metrics.stages.length,
				};
				pi.appendEntry(RETRO_ENTRY_TYPE, card);
				ctx.ui.notify(`Devloop retrospective ${runId} added to history (Ctrl+O to expand). Full report: .pi/devloop-sessions/${runId}.retro.md`, "info");
			} catch (error) {
				ctx.ui.notify(
					`Devloop retro failed: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		},
	});
}
