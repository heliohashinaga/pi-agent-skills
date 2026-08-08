import { describe, expect, test } from "bun:test";

import { buildRetroRequest, retroResultSchema, RETRO_ANALYSIS_TIMEOUT_MS } from "../retro-agent";

// Minimal structural JSON-Schema assertions (no external validator needed for
// the contract surface we care about here).
function validateAgainstSchema(
	schema: Record<string, any>,
	value: unknown,
	requiredProps: string[],
): boolean {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const obj = value as Record<string, unknown>;
	for (const prop of requiredProps) {
		if (!(prop in obj)) return false;
	}
	// spot-check types of primitive fields
	if (obj.summary !== undefined && typeof obj.summary !== "string") return false;
	// recommendations must be an array of objects with area/action/rationale strings
	const recs = obj.recommendations;
	if (!Array.isArray(recs)) return false;
	return recs.every(
		(r: unknown) =>
			typeof r === "object" &&
			r !== null &&
			typeof (r as Record<string, unknown>).area === "string" &&
			typeof (r as Record<string, unknown>).action === "string" &&
			typeof (r as Record<string, unknown>).rationale === "string",
	);
}

describe("retro agent contract (read-only delegation)", () => {
	test("buildRetroRequest targets the read-only retro agent, fresh context, structured schema", () => {
		const req = buildRetroRequest("r-1", "/repo", "owner-1", "/repo/.pi/devloop/sessions/r-1.retro.json", ["/repo/.pi/devloop/sessions/T009.json"]);
		expect(req.agent).toBe("retro");
		expect(req.context).toBe("fresh");
		expect(req.toolBudget?.block).toContain("write");
		expect(req.toolBudget?.block).toContain("edit");
		expect(req.toolBudget?.block).toContain("bash");
		expect(req.toolBudget?.block).toContain("intercom"); // never talk back / mutate
		expect(req.artifacts).toBe(false);
		expect(req.result.kind).toBe("structured");
		expect(req.timeoutMs).toBe(RETRO_ANALYSIS_TIMEOUT_MS);
		expect(req.task).toContain("r-1");
		expect(req.task).toContain("strictly read-only");
		expect(req.task).toContain("never any user/child PII");
	});

	test("retroResultSchema requires summary + recommendations with area/action/rationale", () => {
		const required = (retroResultSchema.required as string[]) ?? [];
		expect(required).toContain("summary");
		expect(required).toContain("recommendations");
		expect(retroResultSchema.properties?.recommendations?.items?.required).toEqual([
			"area",
			"action",
			"rationale",
		]);
		// every object forbids extra props (strictness: agent cannot smuggle fields)
		expect(retroResultSchema.additionalProperties).toBe(false);
		expect(retroResultSchema.properties?.recommendations?.items?.additionalProperties).toBe(false);
	});

	test("a well-formed retro output validates against the schema contract", () => {
		const good = {
			summary: "Retries concentrated in the review gate.",
			recommendations: [
				{ area: "review", action: "tighten review instructions", rationale: "CHANGES_REQUESTED loop across 2 slices" },
			],
		};
		expect(
			validateAgainstSchema(retroResultSchema as unknown as Record<string, any>, good, [
				"summary",
				"recommendations",
			]),
		).toBe(true);
	});

	test("an output missing recommendations is rejected", () => {
		const bad = { summary: "only a summary" };
		expect(
			validateAgainstSchema(retroResultSchema as unknown as Record<string, any>, bad, [
				"summary",
				"recommendations",
			]),
		).toBe(false);
	});

	test("an output with non-array recommendations is rejected", () => {
		const bad = { summary: "x", recommendations: "not-an-array" };
		expect(
			validateAgainstSchema(retroResultSchema as unknown as Record<string, any>, bad, [
				"summary",
				"recommendations",
			]),
		).toBe(false);
	});
});
