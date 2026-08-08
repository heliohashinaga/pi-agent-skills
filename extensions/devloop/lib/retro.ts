import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FindingSeverity } from "./contracts";
import { SESSIONS_DIR as SESSIONS_DIR_STORAGE } from "./storage";
import type { PipelineSnapshot, PipelineStep, PipelineTerminal } from "./pipeline";

/**
 * Read-only run retrospective (the "facts" half of the devloop retro loop).
 *
 * A run records a deterministic, consolidated summary of how a devloop
 * execution went — per-gate metrics plus run-level aggregates — derived purely
 * from the pipeline observer snapshot. This module only deals with *facts*; it
 * never interprets them. Interpretation (recommendations) is produced later by
 * the read-only `retro` agent and merged into the markdown report separately.
 *
 * Artifacts are persisted under `<repoRoot>/<SESSIONS_DIR>` (the repo root, NOT
 * the worktree, because the worktree is removed on success). Files are named
 * `<runId>.retro.json` (machine facts) and `<runId>.retro.md` (human report) so
 * they never collide with the per-task ledger `<taskId>.json` files in the same
 * directory. This is local development metadata — never leaves the machine,
 * gitignored, and never contains user/child PII.
 */

export const RETRO_SCHEMA_VERSION = 1;
const SESSIONS_DIR = SESSIONS_DIR_STORAGE;
export const RETRO_SUFFIX = ".retro";

/** Run-level context captured by the runtime when closing a run. */
export interface RetroRunMeta {
	runId: string;
	/** selectionLabel: task id, phase-N, or A-B. */
	label: string;
	/** Task ids owned by this run (single for a task, list for a batch). */
	taskIds: string[];
	branch: string;
	stackName: string;
	/** Optional sha of the run tip at close (omitted when not yet committed). */
	gitSha?: string;
	startedAt: string;
	finishedAt: string;
}

export interface RetroGateMetrics {
	stage: string;
	agent: string;
	/** Number of dispatch attempts for this unit/stage/agent (retries ≥ 1). */
	attempts: number;
	status: "done" | "failed" | "running";
	verdict?: string;
	error?: string;
	durationMs?: number;
	tokens?: number;
	toolCount?: number;
	findingsBySeverity: Record<FindingSeverity, number>;
}

export interface RetroAggregate {
	/** Sum of `durationMs` across every closed step (retries included). */
	totalDurationMs?: number;
	/** Sum of `tokens` across every step reporting token usage. */
	totalTokens?: number;
	/** Sum of `toolCount` across every step reporting tool calls. */
	totalToolCalls?: number;
	runStatus?: PipelineTerminal;
	reason?: string;
	/** Re-dispatches that followed a failed step for the same gate. */
	escalations: number;
	/** Sum of (attempts - 1) per gate: any re-visit of a gate. */
	retries: number;
}

export interface RetroMetrics {
	schemaVersion: typeof RETRO_SCHEMA_VERSION;
	meta: RetroRunMeta;
	aggregate: RetroAggregate;
	stages: RetroGateMetrics[];
}

const SEVERITIES: readonly FindingSeverity[] = ["blocker", "high", "medium", "low"];

function emptySeverityCounts(): Record<FindingSeverity, number> {
	return { blocker: 0, high: 0, medium: 0, low: 0 };
}

/** Group key for a gate: a work unit dispatches each (stage, agent) many times. */
function gateKey(step: PipelineStep): string {
	return `${step.unit}\u0000${step.stage}\u0000${step.agent}`;
}

/**
 * Deterministically reduce a closed pipeline snapshot to run-level facts.
 * One `RetroGateMetrics` per distinct (unit, stage, agent); aggregates cover the
 * whole run. Purely functional — no I/O, injectable `now` not required since
 * durations are read from the snapshot.
 */
export function consolidate(snapshot: PipelineSnapshot, meta: RetroRunMeta): RetroMetrics {
	const groups = new Map<string, PipelineStep[]>();
	for (const step of snapshot.steps) {
		const key = gateKey(step);
		const bucket = groups.get(key);
		if (bucket) bucket.push(step);
		else groups.set(key, [step]);
	}

	const stages: RetroGateMetrics[] = [];
	for (const steps of groups.values()) {
		const ordered = [...steps].sort((a, b) => a.index - b.index);
		const last = ordered[ordered.length - 1]!;

		const severities = emptySeverityCounts();
		for (const step of ordered) {
			for (const finding of step.findings ?? []) {
				severities[finding.severity] += 1;
			}
		}

		const status: RetroGateMetrics["status"] =
			last.status === "failed" ? "failed" : last.status === "done" ? "done" : "running";

		stages.push({
			stage: last.stage,
			agent: last.agent,
			attempts: ordered.length,
			status,
			verdict: last.verdict,
			error: last.error,
			durationMs: last.durationMs,
			tokens: last.tokens,
			toolCount: last.toolCount,
			findingsBySeverity: severities,
		});
	}
	stages.sort((a, b) => a.agent.localeCompare(b.agent) || a.stage.localeCompare(b.stage));

	let totalDurationMs = 0;
	let totalTokens = 0;
	let totalToolCalls = 0;
	let escalations = 0;
	let retries = 0;

	for (const steps of groups.values()) {
		const ordered = [...steps].sort((a, b) => a.index - b.index);
		for (let i = 0; i < ordered.length; i += 1) {
			const step = ordered[i]!;
			if (step.durationMs !== undefined) totalDurationMs += step.durationMs;
			if (step.tokens !== undefined) totalTokens += step.tokens;
			if (step.toolCount !== undefined) totalToolCalls += step.toolCount;
			// A re-dispatch whose predecessor failed is an escalation; any
			// non-first dispatch counts toward retries.
			if (i > 0) {
				retries += 1;
				if (ordered[i - 1]!.status === "failed") escalations += 1;
			}
		}
	}

	const aggregate: RetroAggregate = {
		totalDurationMs: totalDurationMs > 0 ? totalDurationMs : undefined,
		totalTokens: totalTokens > 0 ? totalTokens : undefined,
		totalToolCalls: totalToolCalls > 0 ? totalToolCalls : undefined,
		runStatus: snapshot.terminal,
		reason: snapshot.reason,
		escalations,
		retries,
	};

	return { schemaVersion: RETRO_SCHEMA_VERSION, meta, aggregate, stages };
}

// --- human-readable report --------------------------------------------------

function formatDuration(ms?: number): string {
	if (ms === undefined) return "—";
	if (ms < 1000) return `${ms}ms`;
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	return `${m}m ${s % 60}s`;
}

function countsText(counts: Record<FindingSeverity, number>): string {
	const parts = SEVERITIES.filter((s) => counts[s] > 0).map((s) => `${s}:${counts[s]}`);
	return parts.length > 0 ? parts.join(" ") : "—";
}

export interface RetroRecommendation {
	area: string;
	action: string;
	rationale: string;
}

export interface RetroReportInput {
	metrics: RetroMetrics;
	recommendations?: RetroRecommendation[];
}

/**
 * Render the human-readable report. Two clearly separated sections: Facts
 * (deterministic) and, only when provided, Recommendations (interpretation).
 */
export function renderMarkdown({ metrics, recommendations }: RetroReportInput): string {
	const { meta, aggregate, stages } = metrics;
	const lines: string[] = [];
	lines.push(`# Devloop retrospectivo — ${meta.label} (${meta.runId})`);
	lines.push("");
	lines.push(`- **runId:** \`${meta.runId}\``);
	lines.push(`- **label:** \`${meta.label}\``);
	lines.push(`- **tasks:** ${meta.taskIds.join(", ") || "—"}`);
	lines.push(`- **branch:** \`${meta.branch}\``);
	lines.push(`- **stack:** \`${meta.stackName}\``);
	if (meta.gitSha) lines.push(`- **sha:** \`${meta.gitSha}\``);
	lines.push(`- **status:** ${aggregate.runStatus ?? "unknown"}${aggregate.reason ? ` — ${aggregate.reason}` : ""}`);
	lines.push(
		`- **runtime:** ${formatDuration(aggregate.totalDurationMs)} · ${aggregate.totalTokens ?? "—"} tok · ${aggregate.totalToolCalls ?? "—"} tool calls · retries ${aggregate.retries} · escalations ${aggregate.escalations}`,
	);
	lines.push(`- **window:** ${meta.startedAt} → ${meta.finishedAt}`);
	lines.push("");
	lines.push("## Fatos (por etapa)");
	if (stages.length === 0) {
		lines.push("");
		lines.push("*(nenhuma etapa registrada)*");
	} else {
		lines.push("");
		lines.push("| stage | agent | attempts | status | verdict | dur | tokens | tool | findings |");
		lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
		for (const s of stages) {
			const verdict = s.error ? `✗ ${s.error}` : s.verdict ?? "—";
			lines.push(
				`| ${s.stage} | ${s.agent} | ${s.attempts} | ${s.status} | ${verdict} | ${formatDuration(s.durationMs)} | ${s.tokens ?? "—"} | ${s.toolCount ?? "—"} | ${countsText(s.findingsBySeverity)} |`,
			);
		}
	}
	lines.push("");
	lines.push("## Recomendações");
	if (!recommendations || recommendations.length === 0) {
		lines.push("");
		lines.push("*(não gerado — rode `/devloop-retro <runId> --agent`)*");
	} else {
		for (const rec of recommendations) {
			lines.push("");
			lines.push(`### ${rec.area}`);
			lines.push(`- **ação:** ${rec.action}`);
			lines.push(`- **porquê:** ${rec.rationale}`);
		}
	}
	lines.push("");
	return lines.join("\n");
}

// --- persistence ------------------------------------------------------------

export function retroJsonPath(runId: string, repoRoot: string): string {
	return join(repoRoot, SESSIONS_DIR, `${runId}${RETRO_SUFFIX}.json`);
}

export function retroMdPath(runId: string, repoRoot: string): string {
	return join(repoRoot, SESSIONS_DIR, `${runId}${RETRO_SUFFIX}.md`);
}

function ensureDir(repoRoot: string): string {
	const dir = join(repoRoot, SESSIONS_DIR);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

/** Persist the deterministic facts JSON. */
export function writeRetroMetrics(metrics: RetroMetrics, repoRoot: string): void {
	ensureDir(repoRoot);
	writeFileSync(retroJsonPath(metrics.meta.runId, repoRoot), `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
}

/** Persist the human report (facts, plus recommendations when supplied). */
export function writeRetroReport(input: RetroReportInput, repoRoot: string): void {
	ensureDir(repoRoot);
	writeFileSync(retroMdPath(input.metrics.meta.runId, repoRoot), renderMarkdown(input), "utf8");
}

/** Convenience: facts JSON + report markdown (recommendations omitted). */
export function writeRetro(metrics: RetroMetrics, repoRoot: string): void {
	writeRetroMetrics(metrics, repoRoot);
	writeRetroReport({ metrics }, repoRoot);
}

export interface RetroLite {
	runId: string;
	label: string;
	status?: PipelineTerminal;
	branch?: string;
}

/** List consolidated runs (by `*.retro.json`), oldest first. */
export function listRetros(repoRoot: string): RetroLite[] {
	const dir = join(repoRoot, SESSIONS_DIR);
	if (!existsSync(dir)) return [];
	const entries: RetroLite[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(`${RETRO_SUFFIX}.json`)) continue;
		try {
			const parsed = JSON.parse(readFileSync(join(dir, name), "utf8")) as RetroMetrics;
			if (parsed.schemaVersion !== RETRO_SCHEMA_VERSION || !parsed.meta?.runId) continue;
			entries.push({
				runId: parsed.meta.runId,
				label: parsed.meta.label,
				status: parsed.aggregate?.runStatus,
				branch: parsed.meta.branch,
			});
		} catch {
			// skip corrupt/unrelated json
		}
	}
	entries.sort((a, b) => a.runId.localeCompare(b.runId));
	return entries;
}

/** Load a run's facts JSON, or null when absent/corrupt. */
export function readRetro(runId: string, repoRoot: string): RetroMetrics | null {
	const path = retroJsonPath(runId, repoRoot);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as RetroMetrics;
		return parsed.schemaVersion === RETRO_SCHEMA_VERSION && parsed.meta?.runId === runId ? parsed : null;
	} catch {
		return null;
	}
}

/**
 * Prune persisted retrospectives. When `keep > 0`, all but the `keep` most
 * recent runs are removed; otherwise every retrospective is removed. Returns
 * the number of retrospectives removed. Never touches per-task ledgers.
 */
export function removeRetros(repoRoot: string, keep = 0): number {
	const retros = listRetros(repoRoot); // sorted oldest → newest
	const toRemove = keep > 0 ? retros.slice(0, Math.max(0, retros.length - keep)) : retros;
	let removed = 0;
	for (const retro of toRemove) {
		try {
			rmSync(retroJsonPath(retro.runId, repoRoot), { force: true });
			rmSync(retroMdPath(retro.runId, repoRoot), { force: true });
			removed += 1;
		} catch {
			// a missing/locked file should never abort the whole prune
		}
	}
	return removed;
}
