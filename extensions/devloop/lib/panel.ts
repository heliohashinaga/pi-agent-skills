import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

import type { PipelineSnapshot, PipelineStep, StepStatus } from "./pipeline";

/**
 * Rendering for the live devloop pipeline widget (Inc 2).
 *
 * This module only knows how to turn a `PipelineSnapshot` into a TUI `Text`
 * component; it never touches runtime globals, so it stays testable. Colors
 * are applied per-line via the structural `PanelTheme` (the runtime injects
 * the full session theme at widget-render time).
 */

/** Structural subset of the theme we depend on (see stub ExtensionTheme). */
export interface PanelTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export const STATUS_ICON: Record<StepStatus, string> = {
	queued: "⏳",
	running: "●",
	done: "✓",
	failed: "✗",
};

/** Truncate a plain string to `max` visible chars, appending an ellipsis. */
/** Format a duration in ms as a short human-readable string. */
export function formatMs(ms?: number): string {
	if (ms === undefined) return "";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

/** Truncate a plain string to `max` visible chars, appending an ellipsis. */
export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export interface StepLine {
	status: StepStatus;
	icon: string;
	stage: string;
	agent: string;
	detail: string;
}

/**
 * Live elapsed time for a step, in ms. Prefers the reported `durationMs`
 * when present, otherwise derives it from `startedAt` against the render-time
 * clock `now` so a running step keeps ticking between delegation updates.
 */
export function elapsedMs(step: PipelineStep, now: number): number | undefined {
	if (step.durationMs !== undefined) return step.durationMs;
	if (step.startedAt === undefined) return undefined;
	return Math.max(0, now - step.startedAt);
}

/** Presentational details for a single dispatched step. */
export function formatStepLine(step: PipelineStep, now: number = Date.now()): StepLine {
	const icon = STATUS_ICON[step.status];
	let detail: string;
	switch (step.status) {
		case "running": {
			const ms = elapsedMs(step, now);
			// Market convention: lead with the model tag, then the activity, then
			// trailing volatile metadata (tool, elapsed) — e.g. Claude Code statusline.
			const model = step.model ? `[${step.model}] ` : "";
			detail = truncate(`${model}running ${step.tool ?? ""}${ms !== undefined ? ` · ${formatMs(ms)}` : ""}`, 120);
			break;
		}
		case "failed":
			detail = truncate(step.error ?? "failed", 60);
			break;
		case "done":
			detail = truncate(step.verdict ?? "done", 40);
			break;
		default:
			detail = "queued";
	}
	return { status: step.status, icon, stage: step.stage, agent: step.agent, detail };
}

/** Cap how many steps are shown, preserving the most recent ones. */
const MAX_VISIBLE_STEPS = 12;

/** Extract the presentational lines for a snapshot (pure, testable). */
export function pipelineLines(snapshot: PipelineSnapshot, now: number = Date.now()): StepLine[] {
	if (snapshot.steps.length === 0) return [];
	const start = Math.max(0, snapshot.steps.length - MAX_VISIBLE_STEPS);
	return snapshot.steps.slice(start).map((step) => formatStepLine(step, now));
}

/** Color a step line according to its status. */
function colorStep(theme: PanelTheme, line: StepLine): string {
	const icon = theme.fg(statusColor(theme, line.status), line.icon);
	const stage = theme.fg(statusColor(theme, line.status), theme.bold(line.stage));
	const agent = theme.fg("muted", ` ${line.agent}`);
	const detail = theme.fg("dim", `  ${line.detail}`);
	return `${icon} ${stage}${agent}${detail}`;
}

function statusColor(theme: PanelTheme, status: StepStatus): string {
	switch (status) {
		case "done":
			return "success";
		case "failed":
			return "error";
		case "running":
			return "accent";
		default:
			return "muted";
	}
}

function terminalColor(theme: PanelTheme, done: boolean, terminal: PipelineSnapshot["terminal"]): string {
	if (done) return terminal === "ready-to-merge" ? "success" : "error";
	return "accent";
}

function terminalLabel(snapshot: PipelineSnapshot): string {
	if (!snapshot.done) return "in progress";
	if (snapshot.terminal === "ready-to-merge") return "READY_TO_MERGE";
	return "HUMAN_ESCALATION";
}

/**
 * Build a TUI Text component rendering the current pipeline. `label` is the
 * human-readable run label (e.g. "T009" or "T009-T018") shown in the header.
 */
export function renderPipeline(snapshot: PipelineSnapshot, label: string, theme: PanelTheme): Component {
	const lines = pipelineLines(snapshot);
	const title = `devloop ${label}`;
	const state = terminalLabel(snapshot);
	const header = theme.bold(title) + theme.fg("muted", " · ") + theme.fg(terminalColor(theme, snapshot.done, snapshot.terminal), state);

	let text = header;
	if (lines.length === 0) {
		text += "\n" + theme.fg("muted", "  waiting for first gate…");
	} else {
		for (const line of lines) {
			text += "\n" + colorStep(theme, line);
		}
	}
	if (snapshot.reason && snapshot.done) {
		text += "\n" + theme.fg("dim", `  ${snapshot.reason}`);
	}
	return new Text(text, 0, 0);
}
