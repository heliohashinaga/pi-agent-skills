import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type {
	SubagentDelegationRequest as SubagentDelegationV2Request,
	SubagentDelegationResponse as SubagentDelegationV2Response,
} from "pi-subagents/delegation";

import { withTerminalResponseGrace } from "./config";
import { delegate } from "./delegate";
import { readRetro, retroJsonPath, writeRetroReport } from "./retro";
import type { RetroRecommendation } from "./retro";
import { sessionPath } from "./session";

/**
 * Retrospective analysis delegation: dispatch the read-only `retro` agent over a
 * run's consolidated facts (+ any surviving task ledgers) and merge its
 * recommendations into the persisted report. The agent never writes; the runtime
 * persists its structured output. Kept in its own module so the schema and the
 * read-only contract are directly unit-testable.
 */

export const RETRO_ANALYSIS_TIMEOUT_MS = 180_000;

export const retroResultSchema = {
	type: "object",
	additionalProperties: false,
	required: ["summary", "recommendations"],
	properties: {
		summary: { type: "string", minLength: 1 },
		recommendations: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["area", "action", "rationale"],
				properties: {
					area: { type: "string", minLength: 1 },
					action: { type: "string", minLength: 1 },
					rationale: { type: "string", minLength: 1 },
				},
			},
		},
	},
} as const;

export function buildRetroRequest(
	runId: string,
	cwd: string,
	ownerRunId: string,
	factsPath: string,
	ledgerPaths: string[],
): SubagentDelegationV2Request {
	return {
		requestId: randomUUID(), ownerRunId, nodeId: `retro:${randomUUID()}`, agent: "retro",
		task: [
			`Read-only devloop post-run retrospective for run ${runId}.`,
			"Read the run facts JSON and, when present, the per-task session ledgers listed below.",
			"Produce concise, actionable recommendations for improving the devloop pipeline",
			"(prompt quality, gate timeouts, task scoping, model choice, retry patterns).",
			"When runStatus is human-escalation, distinguish a routing/infra failure (e.g. an agent",
			"crash, timeout, or route-to-human) from a slice-quality problem, and only recommend",
			"on the underlying cause rather than blaming task content blindly.",
			"Facts are local development metadata; there is never any user/child PII in them.",
			"You are strictly read-only: do NOT modify any file, write output, or run git.",
			`Facts JSON: ${factsPath}`,
			`Ledgers: ${ledgerPaths.join(", ") || "(none)"}`,
		].join("\n"),
		context: "fresh", cwd, timeoutMs: RETRO_ANALYSIS_TIMEOUT_MS,
		turnBudget: { maxTurns: 16, graceTurns: 0 },
		toolBudget: { hard: 12, block: ["bash", "edit", "write", "intercom"] },
		artifacts: false, result: { kind: "structured", schema: retroResultSchema },
	};
}

export interface RetroAnalysis {
	summary: string;
	recommendations: RetroRecommendation[];
}

/** Dispatch the read-only retro agent and persist recommendations into the report. */
export async function runRetroAnalysis(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	repoRoot: string,
	runId: string,
): Promise<RetroAnalysis> {
	const metrics = readRetro(runId, repoRoot);
	if (!metrics) throw new Error(`No devloop retrospective facts for ${runId}.`);

	const ledgerPaths = metrics.meta.taskIds
		.map((taskId) => sessionPath(taskId, repoRoot))
		.filter((p) => existsSync(p));
	const ownerRunId = `devloop-retro-${randomUUID()}`;
	const request = buildRetroRequest(runId, repoRoot, ownerRunId, retroJsonPath(runId, repoRoot), ledgerPaths);
	const response: SubagentDelegationV2Response = await delegate(pi, ctx, {
		request,
		statusKey: `retro:${runId}`,
		timeoutMs: withTerminalResponseGrace(RETRO_ANALYSIS_TIMEOUT_MS),
	});
	if (response.status !== "completed" || response.result?.kind !== "structured") {
		throw new Error(`retro agent failed (${response.status}): ${response.error ?? "missing structured result"}`);
	}

	const analysis = response.result.value as RetroAnalysis;
	writeRetroReport({ metrics, recommendations: analysis.recommendations }, repoRoot);
	return analysis;
}
