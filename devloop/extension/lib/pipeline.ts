import type { Finding, GateStage } from "./contracts";

/**
 * Pure, UI-free model of a devloop execution for visualization.
 *
 * A run dispatches agents through a sequence of gates. Each dispatch is a
 * "step". Gates can be revisited (retries, tier escalation, planner
 * clarification), so the model keeps an append-only history of steps and lets
 * a "running" step be live-updated with tool/duration/token telemetry.
 *
 * The model only describes *what happened*; it never calls the UI. Consumers
 * (the panel widget, the history cards) apply events to a snapshot and render.
 */

export type StepStatus = "queued" | "running" | "done" | "failed";

export interface LiveTelemetry {
	tool?: string;
	toolCount?: number;
	tokens?: number;
	durationMs?: number;
	/** Effective model of the running child (from delegation updates). */
	model?: string;
}

export interface PipelineStep extends LiveTelemetry {
	/** Monotonic dispatch order across the run. */
	index: number;
	/** Owning work unit (task id), so batch runs can be namespaced. */
	unit: string;
	stage: string;
	agent: string;
	status: StepStatus;
	/** Wall-clock ms at dispatch (stage:start), for live elapsed-time display. */
	startedAt?: number;
	verdict?: string;
	summary?: string;
	error?: string;
	findings?: Finding[];
	changedFiles?: string[];
}

export type PipelineTerminal = "ready-to-merge" | "human-escalation";

export type PipelineEvent =
	| { type: "stage:start"; unit: string; stage: GateStage; agent: string; model?: string }
	| ({ type: "live:update"; unit: string; stage: GateStage; agent: string } & LiveTelemetry)
	| {
			type: "stage:done";
			unit: string;
			stage: GateStage;
			agent: string;
			verdict?: string;
			summary?: string;
			findings?: Finding[];
			changedFiles?: string[];
	  }
	| { type: "stage:failed"; unit: string; stage: GateStage; agent: string; error?: string }
	| { type: "stage:timeout"; unit: string; stage: GateStage; agent: string; tokens?: number; toolCalls?: number; durationMs: number }
	| { type: "run:end"; unit: string; status: PipelineTerminal; reason?: string };

export interface PipelineSnapshot {
	steps: PipelineStep[];
	done: boolean;
	terminal?: PipelineTerminal;
	reason?: string;
}

export function createPipeline(): PipelineSnapshot {
	return { steps: [], done: false };
}

function isRunningStep(step: PipelineStep, unit: string, stage: string, agent: string): boolean {
	return step.unit === unit && step.stage === stage && step.agent === agent && step.status === "running";
}

/** Index of the most recent running step for a unit/stage/agent, or -1. */
function lastRunningIndex(steps: readonly PipelineStep[], unit: string, stage: string, agent: string): number {
	for (let i = steps.length - 1; i >= 0; i -= 1) {
		const step = steps[i];
		if (step && isRunningStep(step, unit, stage, agent)) return i;
	}
	return -1;
}

/**
 * Apply a single event to a snapshot, returning a new snapshot. The input
 * snapshot is never mutated (immutable update, easy to test and diff).
 */
export function applyEvent(snapshot: PipelineSnapshot, event: PipelineEvent, now: number = Date.now()): PipelineSnapshot {
	switch (event.type) {
		case "stage:start": {
			const step: PipelineStep = {
				index: snapshot.steps.length,
				unit: event.unit,
				stage: event.stage,
				agent: event.agent,
				status: "running",
				startedAt: now,
				...(event.model ? { model: event.model } : {}),
			};
			return { ...snapshot, steps: [...snapshot.steps, step] };
		}

		case "live:update": {
			const idx = lastRunningIndex(snapshot.steps, event.unit, event.stage, event.agent);
			if (idx < 0) return snapshot;
			const running = snapshot.steps[idx]!;
			const steps = [...snapshot.steps];
			steps[idx] = {
				...running,
				tool: event.tool ?? running.tool,
				toolCount: event.toolCount ?? running.toolCount,
				tokens: event.tokens ?? running.tokens,
				durationMs: event.durationMs ?? running.durationMs,
				model: event.model ?? running.model,
			};
			return { ...snapshot, steps };
		}

		case "stage:done": {
			const idx = lastRunningIndex(snapshot.steps, event.unit, event.stage, event.agent);
			if (idx < 0) return snapshot;
			const running = snapshot.steps[idx]!;
			const steps = [...snapshot.steps];
			steps[idx] = {
				...running,
				status: "done" as const,
				verdict: event.verdict,
				summary: event.summary,
				findings: event.findings,
				changedFiles: event.changedFiles,
			};
			return { ...snapshot, steps };
		}

		case "stage:failed": {
			const idx = lastRunningIndex(snapshot.steps, event.unit, event.stage, event.agent);
			if (idx < 0) return snapshot;
			const running = snapshot.steps[idx]!;
			const steps = [...snapshot.steps];
			steps[idx] = { ...running, status: "failed" as const, error: event.error };
			return { ...snapshot, steps };
		}

		case "stage:timeout": {
			const idx = lastRunningIndex(snapshot.steps, event.unit, event.stage, event.agent);
			if (idx < 0) return snapshot;
			const running = snapshot.steps[idx]!;
			const steps = [...snapshot.steps];
			steps[idx] = {
				...running,
				status: "failed" as const,
				error: "timed out",
				...(event.tokens !== undefined ? { tokens: event.tokens } : {}),
				...(event.toolCalls !== undefined ? { toolCount: event.toolCalls } : {}),
				durationMs: event.durationMs,
			};
			return { ...snapshot, steps };
		}

		case "run:end":
			return {
				...snapshot,
				done: true,
				terminal: event.status,
				reason: event.reason,
			};
	}
}

/** Apply a sequence of events to a fresh pipeline (convenience for tests/consumers). */
export function reducePipeline(events: readonly PipelineEvent[], now: number = Date.now()): PipelineSnapshot {
	return events.reduce((acc, event) => applyEvent(acc, event, now), createPipeline());
}

/**
 * Most recent dispatched step for a unit/stage/agent, regardless of status.
 * Unlike `lastRunningIndex`, this also matches after the step has closed, so
 * callers can read final telemetry when building history entries.
 */
export function findLastStep(
	snapshot: PipelineSnapshot,
	unit: string,
	stage: string,
	agent: string,
): PipelineStep | undefined {
	for (let i = snapshot.steps.length - 1; i >= 0; i -= 1) {
		const step = snapshot.steps[i];
		if (step && step.unit === unit && step.stage === stage && step.agent === agent) return step;
	}
	return undefined;
}
