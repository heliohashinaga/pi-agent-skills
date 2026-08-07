import { describe, expect, test } from "bun:test";

import { reducePipeline } from "../pipeline";
import { pipelineLines, renderPipeline, STATUS_ICON, type PanelTheme } from "../panel";

const theme: PanelTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	bold: (text: string) => `*${text}*`,
};

describe("devloop pipeline panel", () => {
	test("status icons cover every step status", () => {
		expect(STATUS_ICON).toEqual({ queued: "⏳", running: "●", done: "✓", failed: "✗" });
	});

	test("pipelineLines returns dispatched steps in order with presentational details", () => {
		const t0 = 1_000_000;
		const snapshot = reducePipeline(
			[
				{ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" },
				{ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED", summary: "scoped" },
				{ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" },
				{ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", tool: "edit" },
			],
			t0,
		);

		const lines = pipelineLines(snapshot, t0 + 2_000);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ status: "done", icon: "✓", stage: "planner", detail: "PLANNED" });
		expect(lines[1]).toMatchObject({ status: "running", icon: "●", stage: "code", agent: "worker-simple", detail: "running edit · 2.0s" });
	});

	test("formats running step showing current tool and live elapsed runtime", () => {
		const t0 = 1_000_000;
		const lines = pipelineLines(
			reducePipeline(
				[
					{ type: "stage:start", unit: "T009", stage: "security", agent: "security-triage" },
					{ type: "live:update", unit: "T009", stage: "security", agent: "security-triage", tool: "bash" },
				],
				t0,
			),
			t0 + 3_700,
		);
		expect(lines[0]?.detail).toBe("running bash · 3.7s");
	});

	test("formats running step showing the child model tag", () => {
		const lines = pipelineLines(reducePipeline([
			{ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" },
			{ type: "live:update", unit: "T009", stage: "planner", agent: "feature-planner", model: "deepseek/deepseek-v4-flash-0731", tool: "bash", durationMs: 233_100 },
		]));
		expect(lines[0]?.detail).toBe("[deepseek/deepseek-v4-flash-0731] running bash · 233.1s");
	});

	test("shows the resolved model from dispatch before child telemetry arrives", () => {
		const t0 = 1_000_000;
		const lines = pipelineLines(reducePipeline([
			{
				type: "stage:start",
				unit: "T019",
				stage: "planner",
				agent: "feature-planner",
				model: "openrouter/deepseek/deepseek-v4-pro",
			},
		], t0), t0 + 29_300);

		expect(lines[0]?.detail).toBe("[openrouter/deepseek/deepseek-v4-pro] running  · 29.3s");
	});

	test("formats running step with reported duration when the update reports one", () => {
		const lines = pipelineLines(reducePipeline([
			{ type: "stage:start", unit: "T009", stage: "security", agent: "security-triage" },
			{ type: "live:update", unit: "T009", stage: "security", agent: "security-triage", tool: "bash", durationMs: 12_500 },
		]));
		expect(lines[0]?.detail).toBe("running bash · 12.5s");
	});

	test("renderPipeline produces a Text containing header and a step line", () => {
		const snapshot = reducePipeline([
			{ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" },
			{ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED" },
			{ type: "run:end", unit: "T009", status: "ready-to-merge", reason: "All gates passed." },
		]);
		const component = renderPipeline(snapshot, "T009", theme);
		expect(component).toBeDefined();
	});

	test("renderPipeline shows waiting state when no steps yet", () => {
		const snapshot = reducePipeline([]);
		const lines = pipelineLines(snapshot);
		expect(lines).toEqual([]);
		const component = renderPipeline(snapshot, "T010", theme);
		expect(component).toBeDefined();
	});

	test("caps very long histories to the most recent steps", () => {
		const events: Array<{ type: "stage:start"; unit: string; stage: "planner"; agent: string }> = [];
		for (let i = 0; i < 15; i += 1) {
			events.push({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		}
		const snapshot = reducePipeline(events);
		expect(snapshot.steps).toHaveLength(15);
		const lines = pipelineLines(snapshot);
		expect(lines).toHaveLength(12); // MAX_VISIBLE_STEPS
		expect(lines[lines.length - 1]?.stage).toBe("planner");
	});
});
