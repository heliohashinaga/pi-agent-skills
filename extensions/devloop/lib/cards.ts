import { Container, Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

import type { Finding, FindingSeverity } from "./contracts";
import { formatMs, truncate, type PanelTheme } from "./panel";

export { formatMs };

/**
 * Durable per-gate history card (Inc 3).
 *
 * Each gate (stage:done / stage:failed) appends a `GateCardData` via
 * `pi.appendEntry("devloop:gate", data)`, and the registered entry renderer
 * draws it as a card in the chat history. Entries are durable and are NOT
 * sent to the LLM, so the history accumulates without polluting context.
 */

export interface GateCardData {
	unit: string;
	stage: string;
	agent: string;
	verdict?: string;
	summary?: string;
	error?: string;
	findings?: Finding[];
	changedFiles?: string[];
	tokens?: number;
	durationMs?: number;
	toolCount?: number;
}

const SEVERITY_COLOR: Record<FindingSeverity, string> = {
	blocker: "error",
	high: "error",
	medium: "warning",
	low: "muted",
};

/** Durable per-run retrospective card (Inc retro). */
export const RETRO_ENTRY_TYPE = "devloop:retro";

export interface RetroCardData {
	runId: string;
	label: string;
	status?: string;
	reason?: string;
	totalDurationMs?: number;
	totalTokens?: number;
	totalToolCalls?: number;
	retries: number;
	escalations: number;
	stageCount: number;
}

/** Render a retrospective card. Collapsed: single header line. Expanded: details. */
export function renderRetroCard(data: RetroCardData, expanded: boolean, theme: PanelTheme): Component {
	const container = new Container();
	const icon = data.status === "human-escalation" ? theme.fg("error", "✗") : theme.fg("success", "✓");
	const head = theme.fg("toolTitle", theme.bold("retro")) + theme.fg("accent", ` ${data.label}`);
	const run = theme.fg("muted", ` · ${data.runId}`);
	let header = `${icon} ${head}${run}`;
	if (data.status) header += ` ${theme.fg("accent", theme.bold(data.status))}`;
	container.addChild(new Text(header, 0, 0));

	if (!expanded) {
		if (data.reason) container.addChild(new Text(theme.fg("muted", "  (Ctrl+O to expand)"), 0, 0));
		return container;
	}

	if (data.reason) container.addChild(new Text(theme.fg("dim", `  ${truncate(data.reason, 160)}`), 0, 0));

	const meta: string[] = [`${data.stageCount} stages`];
	if (data.totalTokens !== undefined) meta.push(`${data.totalTokens} tok`);
	if (data.totalToolCalls !== undefined) meta.push(`${data.totalToolCalls} tool calls`);
	if (data.totalDurationMs !== undefined) meta.push(formatMs(data.totalDurationMs));
	meta.push(`retries ${data.retries}`);
	meta.push(`escalations ${data.escalations}`);
	container.addChild(new Text(theme.fg("dim", `  ${meta.join(" · ")}`), 0, 0));

	return container;
}

function headerLine(data: GateCardData, theme: PanelTheme): string {
	const icon = data.error ? theme.fg("error", "✗") : theme.fg("success", "✓");
	const head = theme.fg("toolTitle", theme.bold("devloop")) + theme.fg("accent", ` ${data.stage}`);
	const agent = theme.fg("muted", ` · ${data.agent}`);
	let text = `${icon} ${head}${agent}`;
	if (data.error) text += ` ${theme.fg("error", `[${data.error}]`)}`;
	else if (data.verdict) text += ` ${theme.fg("accent", theme.bold(data.verdict))}`;
	return text;
}

function severityText(finding: Finding, theme: PanelTheme): string {
	return theme.fg(SEVERITY_COLOR[finding.severity], `[${finding.severity}]`) + theme.fg("dim", ` ${truncate(finding.message, 140)}`);
}

/** Render a gate card. Collapsed: single header line. Expanded: details. */
export function renderGateCard(data: GateCardData, expanded: boolean, theme: PanelTheme): Component {
	const container = new Container();
	container.addChild(new Text(headerLine(data, theme), 0, 0));

	if (!expanded) {
		if (data.error) container.addChild(new Text(theme.fg("muted", "  (Ctrl+O to expand)"), 0, 0));
		return container;
	}

	if (data.error) container.addChild(new Text(theme.fg("error", `  ${truncate(data.error, 120)}`), 0, 0));
	if (data.summary) container.addChild(new Text(theme.fg("dim", `  ${truncate(data.summary, 160)}`), 0, 0));

	for (const finding of data.findings ?? []) {
		container.addChild(new Text(severityText(finding, theme), 0, 0));
	}

	if (data.changedFiles && data.changedFiles.length > 0) {
		const files = truncate(data.changedFiles.slice(0, 6).join(", "), 120);
		const extra = data.changedFiles.length > 6 ? ` +${data.changedFiles.length - 6} more` : "";
		container.addChild(new Text(theme.fg("dim", `  files: ${files}${extra}`), 0, 0));
	}

	const meta: string[] = [];
	if (data.tokens !== undefined) meta.push(`${data.tokens} tok`);
	if (data.toolCount !== undefined) meta.push(`${data.toolCount} tool calls`);
	if (data.durationMs !== undefined) meta.push(formatMs(data.durationMs));
	if (meta.length > 0) container.addChild(new Text(theme.fg("dim", `  ${meta.join(" · ")}`), 0, 0));

	return container;
}
