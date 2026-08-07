import { describe, expect, test } from "bun:test";

import { createPipelineObserver, DEFAULT_RENDER_THROTTLE_MS, GATE_ENTRY_TYPE } from "../observer";

interface Harness {
	observer: ReturnType<typeof createPipelineObserver>;
	renders: Array<unknown>;
	entries: Array<{ type: string; data: unknown }>;
	cleared: number;
	scheduled: Array<() => void>;
	tick: { intervals: Array<() => void>; stopped: number[] };
}

/** Build an observer with an injectable scheduler that does not auto-run. */
function makeHarness(
	tuiEnabled = true,
	throttleMs = DEFAULT_RENDER_THROTTLE_MS,
	tick: { intervals: Array<() => void>; stopped: number[] } = { intervals: [], stopped: [] },
): Harness {
	const harness: Harness = {
		renders: [],
		entries: [],
		cleared: 0,
		scheduled: [],
		tick,
		observer: undefined as unknown as ReturnType<typeof createPipelineObserver>,
	};
	harness.observer = createPipelineObserver({
		label: "T009",
		tuiEnabled,
		setWidget: (content) => harness.renders.push(content),
		clearWidget: () => {
			harness.cleared += 1;
		},
		appendEntry: (type, data) => harness.entries.push({ type, data }),
		renderThrottleMs: throttleMs,
		schedule: (fn) => {
			harness.scheduled.push(fn);
			return harness.scheduled.length;
		},
		cancel: () => {},
		startTick: (fn) => {
			tick.intervals.push(fn);
			return tick.intervals.length;
		},
		stopTick: () => {
			tick.stopped.push(1);
		},
	});
	return harness;
}

function flush(harness: Harness): void {
	while (harness.scheduled.length > 0) {
		const fn = harness.scheduled.shift()!;
		fn();
	}
}

describe("devloop pipeline observer (Inc 5 polish)", () => {
	test("coalesces bursts of live:update into a single scheduled render", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		harness.observer.onEvent({ type: "live:update", unit: "T009", stage: "planner", agent: "feature-planner", tool: "read" });
		harness.observer.onEvent({ type: "live:update", unit: "T009", stage: "planner", agent: "feature-planner", tool: "bash" });
		harness.observer.onEvent({ type: "live:update", unit: "T009", stage: "planner", agent: "feature-planner", tool: "edit" });

		expect(harness.scheduled).toHaveLength(1); // one pending render for all events
		flush(harness);
		expect(harness.renders).toHaveLength(1);
	});

	test("render() flushes the pending render immediately", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		expect(harness.renders).toHaveLength(0);
		harness.observer.render();
		expect(harness.renders).toHaveLength(1);
	});

	test("starts a ticking interval while a step is running", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		expect(harness.tick.intervals).toHaveLength(1); // tick armed while running
		harness.observer.onEvent({ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED" });
		expect(harness.tick.stopped).toHaveLength(1); // tick cleared once no step runs
	});

	test("tick drives re-renders so elapsed runtime advances", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		expect(harness.renders).toHaveLength(0);
		harness.tick.intervals[0]!(); // fire the tick
		expect(harness.renders).toHaveLength(1);
	});

	test("clear() stops the running tick interval", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		expect(harness.tick.intervals).toHaveLength(1);
		harness.observer.clear();
		expect(harness.tick.stopped).toHaveLength(1);
	});

	test("appends a gate card on stage:done with telemetry from the step", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "code", agent: "worker-simple" });
		harness.observer.onEvent({ type: "live:update", unit: "T009", stage: "code", agent: "worker-simple", tool: "edit", tokens: 600, durationMs: 2500, toolCount: 4 });
		harness.observer.onEvent({ type: "stage:done", unit: "T009", stage: "code", agent: "worker-simple", verdict: "IMPLEMENTED", summary: "done", changedFiles: ["a.ts"] });

		expect(harness.entries).toHaveLength(1);
		const entry = harness.entries[0]!;
		expect(entry.type).toBe(GATE_ENTRY_TYPE);
		expect(entry.data).toMatchObject({
			stage: "code",
			verdict: "IMPLEMENTED",
			tokens: 600,
			durationMs: 2500,
			toolCount: 4,
			changedFiles: ["a.ts"],
		});
	});

	test("appends a failed gate card on stage:failed", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "security", agent: "security-triage" });
		harness.observer.onEvent({ type: "stage:failed", unit: "T009", stage: "security", agent: "security-triage", error: "boom" });

		expect(harness.entries).toHaveLength(1);
		expect(harness.entries[0]!.data).toMatchObject({ stage: "security", error: "boom" });
	});

	test("persists terminal timeout telemetry before a failed gate closes", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T019", stage: "planner", agent: "feature-planner" });
		harness.observer.onEvent({
			type: "live:update",
			unit: "T019",
			stage: "planner",
			agent: "feature-planner",
			toolCount: 2,
			tokens: 1600,
			durationMs: 300_000,
		});
		harness.observer.onEvent({
			type: "stage:failed",
			unit: "T019",
			stage: "planner",
			agent: "feature-planner",
			error: "feature-planner failed (timed_out): Subagent timed out after 300000ms.",
		});

		expect(harness.entries[0]!.data).toMatchObject({
			stage: "planner",
			error: "feature-planner failed (timed_out): Subagent timed out after 300000ms.",
			toolCount: 2,
			tokens: 1600,
			durationMs: 300_000,
		});
	});

	test("non-TUI mode: still appends cards but never renders the widget", () => {
		const harness = makeHarness(false);
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		harness.observer.onEvent({ type: "stage:done", unit: "T009", stage: "planner", agent: "feature-planner", verdict: "PLANNED" });
		flush(harness);

		expect(harness.renders).toHaveLength(0);
		expect(harness.entries).toHaveLength(1);
	});

	test("clear() cancels pending render and clears the widget", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		harness.observer.clear();
		// pending render remains unscheduled (not flushed)
		expect(harness.renders).toHaveLength(0);
		expect(harness.cleared).toBe(1);
	});

	test("snapshot reflects applied events", () => {
		const harness = makeHarness();
		harness.observer.onEvent({ type: "stage:start", unit: "T009", stage: "planner", agent: "feature-planner" });
		expect(harness.observer.snapshot().steps).toHaveLength(1);
	});
});
