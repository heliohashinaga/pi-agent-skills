import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type SubagentDelegationRequest as SubagentDelegationV2Request,
} from "pi-subagents/delegation";
import { resolveSubagentLaunchContract } from "pi-subagents/preflight";

import { delegate } from "../lib/delegate";
import { withTerminalResponseGrace } from "../lib/config";

const MAX_SMOKE_AGENTS_PER_RUN = 8;

const smokeResultSchema = {
	type: "object",
	additionalProperties: false,
	required: ["verdict", "summary"],
	properties: { verdict: { const: "SMOKE_PASS" }, summary: { type: "string", minLength: 1 } },
};

function buildSmokeRequest(agent: string, cwd: string, ownerRunId: string): SubagentDelegationV2Request {
	return {
		requestId: randomUUID(), ownerRunId, nodeId: `smoke:${randomUUID()}`, agent,
		task: "Read-only devloop smoke test. Do not modify files or run commands. Return SMOKE_PASS with a concise summary; read-only inspection is allowed only if needed.",
		context: "fresh", cwd, timeoutMs: 120_000,
		turnBudget: { maxTurns: 8, graceTurns: 0 },
		toolBudget: { hard: 8, block: ["bash", "edit", "write", "intercom"] },
		artifacts: false, result: { kind: "structured", schema: smokeResultSchema },
	};
}

/** `/devloop-smoke` — smoke-test delegation v2 against one or more agents. */
export function registerDevloopSmoke(pi: ExtensionAPI): void {
	pi.registerCommand("devloop-smoke", {
		description: "Smoke-test delegation v2 (usage: /devloop-smoke [agent...])",
		handler: async (args, ctx) => {
			const agents = args.trim() ? args.trim().split(/\s+/) : ["task-qa", "tester-complex", "security-triage"];
			if (agents.length > MAX_SMOKE_AGENTS_PER_RUN) {
				throw new Error(`Smoke accepts at most ${MAX_SMOKE_AGENTS_PER_RUN} agents per run; split the list across invocations.`);
			}
			const ownerRunId = `devloop-smoke-${randomUUID()}`;
			const results: string[] = [];
			for (const agent of agents) {
				try {
					const preflight = await resolveSubagentLaunchContract({ agent, cwd: ctx.cwd, context: "fresh", agentScope: "both", availableModels: ctx.modelRegistry.getAvailable(), artifacts: false, outputSchema: smokeResultSchema });
					if (!preflight.ok) throw new Error(`${preflight.code}: ${preflight.message}`);
					const request = buildSmokeRequest(agent, ctx.cwd, ownerRunId);
					const response = await delegate(pi, ctx, {
						request,
						statusKey: `smoke:${agent}`,
						timeoutMs: withTerminalResponseGrace(request.timeoutMs ?? 120_000),
					});
					if (response.status !== "completed" || response.result?.kind !== "structured") {
						throw new Error(`status ${response.status}: ${response.error ?? "missing structured result"}`);
					}
					if ((response.result.value as Record<string, unknown>).verdict !== "SMOKE_PASS") throw new Error("unexpected structured result");
					results.push(`${agent}: PASS`);
				} catch (error) { results.push(`${agent}: FAIL (${error instanceof Error ? error.message : String(error)})`); }
			}
			const failed = results.some((result) => result.includes("FAIL"));
			ctx.ui.notify(`Devloop smoke: ${results.join(" | ")}`, failed ? "error" : "info");
			if (failed) throw new Error(`Devloop smoke failed: ${results.filter((result) => result.includes("FAIL")).join(" | ")}`);
		},
	});
}
