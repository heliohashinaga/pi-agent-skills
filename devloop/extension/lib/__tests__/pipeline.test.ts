import { describe, expect, test } from "bun:test";

import { applyEvent, createPipeline, findLastStep, reducePipeline, type PipelineEvent } from "../pipeline";

describe("devloop pipeline model", () => {
	test("queues nothing initially and is not done", () => {
		const snap = createPipeline();
		expect(snap.steps).toEqual([]);
		expect(snap.done).toBe(false);
	});

	test("happy path: start/done each gate in dispatch order", () => {
		const events: PipelineEvent[] = [
			{ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" },
			{ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED", summary: "scoped" },
			{ type: "stage:start", unit: "T009", stage: "task-qa", agent: "task-qa" },
			{ type: "stage:done", unit: "T009", stage: "task-qa", agent: "task-qa", verdict: "READY", summary: "ok" },
			{ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" },
			{ type: "stage:done", unit: "T009", stage: "code", agent: "worker-simple", verdict: "IMPLEMENTED", summary: "done" },
			{ type: "run:end", unit: "T009", status: "ready-to-merge", reason: "All gates passed." },
		];

		const snap = reducePipeline(events);

		expect(snap.done).toBe(true);
		expect(snap.terminal).toBe("ready-to-merge");
		expect(snap.steps).toHaveLength(3);
		expect(snap.steps.map((s) => s.stage)).toEqual(["planner", "task-qa", "code"]);
		expect(snap.steps.every((s) => s.status === "done")).toBe(true);
		// indices are monotonic dispatch order
		expect(snap.steps.map((s) => s.index)).toEqual([0, 1, 2]);
	});

	test("telemetry updates the running step and survives into the done step", () => {
		const events: PipelineEvent[] = [
			{ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" },
			{ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", tool: "bash", durationMs: 420 },
			{ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", tool: "edit", toolCount: 7, tokens: 3200, model: "deepseek/deepseek-v4-flash-0731" },
			{ type: "stage:done", unit: "T009", stage: "code", agent: "worker-simple", verdict: "IMPLEMENTED", summary: "done" },
		];

		const snap = reducePipeline(events);
		const step = snap.steps[0]!;
		expect(step.status).toBe("done");
		expect(step.tool).toBe("edit"); // last live update wins
		expect(step.toolCount).toBe(7);
		expect(step.tokens).toBe(3200);
		expect(step.durationMs).toBe(420);
		expect(step.model).toBe("deepseek/deepseek-v4-flash-0731"); // model survives to close
		expect(step.verdict).toBe("IMPLEMENTED");
	});

	test("telemetry for an unknown/no running step is ignored", () => {
		const snap = reducePipeline([
			{ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", tool: "bash" },
		]);
		expect(snap.steps).toEqual([]);
	});

	test("retry visits the same stage twice with distinct dispatch indices", () => {
		const events: PipelineEvent[] = [
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
			{ type: "stage:done", unit: "T009", stage: "review", agent: "reviewer-simple", verdict: "CHANGES_REQUESTED", summary: "fix it" },
			{ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" },
			{ type: "stage:done", unit: "T009", stage: "code", agent: "worker-simple", verdict: "IMPLEMENTED", summary: "fixed" },
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
			{ type: "stage:done", unit: "T009", stage: "review", agent: "reviewer-simple", verdict: "APPROVED", summary: "approved" },
		];

		const snap = reducePipeline(events);
		const reviews = snap.steps.filter((s) => s.stage === "review");
		expect(reviews).toHaveLength(2);
		expect(reviews.map((s) => s.index)).toEqual([0, 2]);
		expect(reviews.map((s) => s.verdict)).toEqual(["CHANGES_REQUESTED", "APPROVED"]);
	});

	test("failed step + terminal human-escalation", () => {
		const snap = reducePipeline([
			{ type: "stage:start", unit: "T009", stage: "security", agent: "security-triage" },
			{ type: "stage:failed", unit: "T009", stage: "security", agent: "security-triage", error: "delegate crashed" },
			{ type: "run:end", unit: "T009", status: "human-escalation", reason: "security delegate failed: delegate crashed" },
		]);
		expect(snap.steps[0]?.status).toBe("failed");
		expect(snap.steps[0]?.error).toBe("delegate crashed");
		expect(snap.done).toBe(true);
		expect(snap.terminal).toBe("human-escalation");
	});

	test("applyEvent is immutable: does not mutate the input snapshot", () => {
		const snap = createPipeline();
		applyEvent(snap, { type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		expect(snap.steps).toEqual([]);

		const started = applyEvent(snap, { type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		const updated = applyEvent(started, { type: "live:update", unit: "T009", stage: "planner", agent: "feature-planner", tool: "read" });
		expect(started.steps[0]?.tool).toBeUndefined(); // original unchanged
		expect(updated.steps[0]?.tool).toBe("read");
	});

	test("findLastStep returns the most recent matching step incl. closed ones", () => {
		const snapshot = reducePipeline([
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
			{ type: "stage:done", unit: "T009", stage: "review", agent: "reviewer-simple", verdict: "CHANGES_REQUESTED" },
			{ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" },
			{ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", tool: "edit", tokens: 500 },
			{ type: "stage:start", unit: "T009", stage: "review", agent: "reviewer-simple" },
		]);

		// most recent review dispatch (running) even though an older closed one exists
		const review = findLastStep(snapshot, "T009", "review", "reviewer-simple");
		expect(review?.index).toBe(2);
		expect(review?.status).toBe("running");

		// closed step still reachable for telemetry (nothing running)
		const impl = findLastStep(snapshot, "T009", "code", "worker-simple");
		expect(impl?.status).toBe("running");
		expect(impl?.tool).toBe("edit");
		expect(impl?.tokens).toBe(500);

		expect(findLastStep(snapshot, "T009", "planner", "feature-planner")).toBeUndefined();
	});
});
