import { describe, expect, test, afterAll } from "bun:test";

import { consolidate, renderMarkdown, writeRetro, readRetro, listRetros, retroJsonPath, removeRetros, RETRO_SUFFIX } from "../retro";
import { reducePipeline, type PipelineEvent, type PipelineSnapshot } from "../pipeline";
import { rmSync } from "node:fs";

function meta(runId = "r-123", overrides: Partial<Parameters<typeof consolidate>[1]> = {}) {
	return {
		runId,
		label: "T009",
		taskIds: ["T009"],
		branch: "devloop/T009-r-123",
		stackName: "phase-3",
		startedAt: "2026-01-01T00:00:00.000Z",
		finishedAt: "2026-01-01T00:05:00.000Z",
		...overrides,
	};
}

function snapshot(events: PipelineEvent[]): PipelineSnapshot {
	return reducePipeline(events);
}

describe("retro consolidate (facts)", () => {
	test("happy path: one metrics row per gate with final telemetry", () => {
		const snap = snapshot([
			{ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" },
			{ type: "live:update", unit: "T009", stage: "planner", agent: "feature-planner", toolCount: 2, tokens: 900, durationMs: 300 },
			{ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED", summary: "scoped" },
			{ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" },
			{ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", toolCount: 7, tokens: 3200, durationMs: 420 },
			{ type: "stage:done", unit: "T009", stage: "code", agent: "worker-simple", verdict: "IMPLEMENTED", summary: "done",
				findings: [{ severity: "medium", message: "nit" }] },
			{ type: "run:end", unit: "T009", status: "ready-to-merge", reason: "All gates passed." },
		]);

		const metrics = consolidate(snap, meta());
		expect(metrics.schemaVersion).toBe(1);
		expect(metrics.meta.taskIds).toEqual(["T009"]);
		expect(metrics.stages).toHaveLength(2);
		expect(metrics.aggregate.runStatus).toBe("ready-to-merge");
		expect(metrics.aggregate.totalTokens).toBe(4100);
		expect(metrics.aggregate.totalToolCalls).toBe(9);
		expect(metrics.aggregate.totalDurationMs).toBe(720);
		expect(metrics.aggregate.retries).toBe(0);
		expect(metrics.aggregate.escalations).toBe(0);

		const code = metrics.stages.find((s) => s.stage === "code");
		expect(code?.attempts).toBe(1);
		expect(code?.verdict).toBe("IMPLEMENTED");
		expect(code?.tokens).toBe(3200);
		expect(code?.toolCount).toBe(7);
		expect(code?.durationMs).toBe(420);
		expect(code?.findingsBySeverity).toEqual({ blocker: 0, high: 0, medium: 1, low: 0 });
	});

	test("retry revisited gate contributes attempts and aggregate totals once per step", () => {
		const snap = snapshot([
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
			{ type: "live:update", unit: "T009", stage: "review", agent: "reviewer-simple", tokens: 1000, durationMs: 500 },
			{ type: "stage:done", unit: "T009", stage: "review", agent: "reviewer-simple", verdict: "CHANGES_REQUESTED" },
			{ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" },
			{ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", tokens: 600, durationMs: 300 },
			{ type: "stage:done", unit: "T009", stage: "code", agent: "worker-simple", verdict: "IMPLEMENTED" },
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
			{ type: "live:update", unit: "T009", stage: "review", agent: "reviewer-simple", tokens: 700, durationMs: 200 },
			{ type: "stage:done", unit: "T009", stage: "review", agent: "reviewer-simple", verdict: "APPROVED" },
		]);

		const metrics = consolidate(snap, meta());
		const review = metrics.stages.find((s) => s.stage === "review");
		expect(review?.attempts).toBe(2); // visited twice
		// final (last) step wins for telemetry/verdict
		expect(review?.verdict).toBe("APPROVED");
		expect(review?.tokens).toBe(700);
		expect(review?.durationMs).toBe(200);
		// aggregate counts each step once
		expect(metrics.aggregate.totalTokens).toBe(2300);
		expect(metrics.aggregate.totalDurationMs).toBe(1000);
		expect(metrics.aggregate.retries).toBe(1);
		expect(metrics.aggregate.escalations).toBe(0); // predecessor was done, not failed
	});

	test("failed gate then re-dispatch counts as an escalation", () => {
		const snap = snapshot([
			{ type: "stage:start", unit: "T009", stage: "security", agent: "security-triage" },
			{ type: "stage:failed", unit: "T009", stage: "security", agent: "security-triage", error: "crash" },
			{ type: "stage:start", unit: "T009", stage: "security", agent: "security-triage" },
			{ type: "stage:done", unit: "T009", stage: "security", agent: "security-triage", verdict: "LOW_RISK" },
			{ type: "run:end", unit: "T009", status: "human-escalation", reason: "security delegate failed: crash" },
		]);

		const metrics = consolidate(snap, meta());
		const sec = metrics.stages.find((s) => s.stage === "security");
		expect(sec?.attempts).toBe(2);
		expect(sec?.status).toBe("done"); // last dispatch closed as done
		expect(sec?.error).toBeUndefined();
		expect(metrics.aggregate.escalations).toBe(1);
		expect(metrics.aggregate.retries).toBe(1);
	});

	test("severity counts aggregate across retries", () => {
		const snap = snapshot([
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
			{ type: "stage:done", unit: "T009", stage: "review", agent: "reviewer-simple", verdict: "CHANGES_REQUESTED",
				findings: [{ severity: "high", message: "a" }, { severity: "high", message: "b" }] },
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
			{ type: "stage:done", unit: "T009", stage: "review", agent: "reviewer-simple", verdict: "APPROVED",
				findings: [{ severity: "high", message: "c" }] },
		]);

		const metrics = consolidate(snap, meta());
		const review = metrics.stages.find((s) => s.stage === "review");
		expect(review?.findingsBySeverity).toEqual({ blocker: 0, high: 3, medium: 0, low: 0 });
	});

	test("failed terminal step surfaces error and status", () => {
		const snap = snapshot([
			{ type: "stage:start", unit: "T009", stage: "security", agent: "security-triage" },
			{ type: "stage:failed", unit: "T009", stage: "security", agent: "security-triage", error: "delegate crashed" },
			{ type: "run:end", unit: "T009", status: "human-escalation", reason: "security delegate failed" },
		]);
		const metrics = consolidate(snap, meta());
		const sec = metrics.stages.find((s) => s.stage === "security");
		expect(sec?.status).toBe("failed");
		expect(sec?.error).toBe("delegate crashed");
		expect(metrics.aggregate.runStatus).toBe("human-escalation");
	});

	test("empty snapshot → no stages, zero retries", () => {
		const metrics = consolidate(snapshot([]), meta());
		expect(metrics.stages).toEqual([]);
		expect(metrics.aggregate.retries).toBe(0);
		expect(metrics.aggregate.escalations).toBe(0);
	});
});

describe("retro renderMarkdown", () => {
	test("two clearly separated sections; recommendations section placeholder when absent", () => {
		const metrics = consolidate(
			snapshot([
				{ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" },
				{ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED" },
			]),
			meta(),
		);
		const md = renderMarkdown({ metrics });
		expect(md).toContain("## Fatos (por etapa)");
		expect(md).toContain("## Recomendações");
		expect(md).toContain("não gerado");
	});

	test("recommendations render under their own section when provided", () => {
		const metrics = consolidate(snapshot([]), meta());
		const md = renderMarkdown({
			metrics,
			recommendations: [{ area: "planner", action: "tighten scope", rationale: "clarified 3×" }],
		});
		expect(md).toContain("### planner");
		expect(md).toContain("tighten scope");
		expect(md).toContain("clarified 3×");
		expect(md).not.toContain("não gerado");
	});
});

describe("retro persistence", () => {
	afterAll(() => {
		rmSync("/tmp/devloop-retro-test-write", { recursive: true, force: true });
		rmSync("/tmp/devloop-retro-test-list", { recursive: true, force: true });
		rmSync("/tmp/devloop-retro-test-prune", { recursive: true, force: true });
	});

	test("writeRetro writes facts JSON + report MD; round-trips via readRetro", () => {
		const dir = "/tmp/devloop-retro-test-write";
		const metrics = consolidate(
			snapshot([
				{ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" },
				{ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED" },
			]),
			meta("r-roundtrip"),
		);

		writeRetro(metrics, dir);
		expect(readRetro("r-roundtrip", dir)).toEqual(metrics);
	});

	test("listRetros only surfaces retro json files, in sorted order", () => {
		const dir = "/tmp/devloop-retro-test-list";
		const base = consolidate(snapshot([]), meta("r-a"));
		writeRetro(base, dir);
		writeRetro(consolidate(snapshot([]), meta("r-b")), dir);

		const items = listRetros(dir);
		expect(items.map((i) => i.runId)).toEqual(["r-a", "r-b"]);
		expect(items[0]?.label).toBe("T009");
	});

	test("retroJsonPath uses the .retro suffix to avoid ledger collisions", () => {
		expect(retroJsonPath("r-1", "/repo")).toBe(`/repo/.pi/devloop-sessions/r-1${RETRO_SUFFIX}.json`);
	});

	test("removeRetros prunes all retros, or keeps the N most recent", () => {
		const dir = "/tmp/devloop-retro-test-prune";
		writeRetro(consolidate(snapshot([]), meta("r-1")), dir);
		writeRetro(consolidate(snapshot([]), meta("r-2")), dir);
		writeRetro(consolidate(snapshot([]), meta("r-3")), dir);

		expect(listRetros(dir).map((i) => i.runId)).toEqual(["r-1", "r-2", "r-3"]);

		// keep = 1 → removes the two oldest
		expect(removeRetros(dir, 1)).toBe(2);
		expect(listRetros(dir).map((i) => i.runId)).toEqual(["r-3"]);

		// keep = 0 → removes everything
		expect(removeRetros(dir)).toBe(1);
		expect(listRetros(dir)).toEqual([]);
	});
});
