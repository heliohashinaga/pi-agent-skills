import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding, GateResult, GateStage, PlannedSliceResult, TestPlan } from "./contracts";

/**
 * Per-task session ledger persisted to disk between devloop gates.
 *
 * The devloop writes one JSON file per active task under `.pi/devloop-sessions/`
 * (relative to the worktree `cwd`). It holds the planner's scoped plan plus a
 * running ledger of every gate's verdict, so a re-dispatched gate (e.g. task-qa
 * after a timeout) can read what previous gates already validated instead of
 * re-deriving the whole corpus from scratch. This is development metadata, not
 * user data — it never leaves the machine and is gitignored.
 */
export const SESSIONS_DIR = ".pi/devloop-sessions";
export const SESSION_SCHEMA_VERSION = 1;

export type SessionStatus = "in-progress" | "ready-to-merge" | "human-escalation" | "failed";
export type SessionStage = GateStage | "ready-to-merge" | "human-escalation";

export interface DevloopPlan {
	summary: string;
	startingWorker: "worker-simple" | "worker-complex";
	skills: string[];
	acceptanceCriteria: string[];
	docsNeeded: boolean;
	testPlan?: TestPlan;
	generatedAt: string;
}

export interface LedgerEntry {
	stage: GateStage;
	agent: string;
	verdict: string;
	summary: string;
	timestamp: string;
	findings?: Finding[];
	corrections?: string[];
}

export interface DevloopSession {
	schemaVersion: typeof SESSION_SCHEMA_VERSION;
	taskId: string;
	startedAt: string;
	updatedAt: string;
	plan: DevloopPlan | null;
	ledger: LedgerEntry[];
	status: SessionStatus;
	currentStage: SessionStage;
}

/** Absolute path of a task's session file under the given (worktree) cwd. */
export function sessionPath(taskId: string, cwd?: string): string {
	const base = cwd ?? process.cwd();
	return join(base, SESSIONS_DIR, `${taskId}.json`);
}

/**
 * Absolute path of a task's standalone plan JSON under the given (worktree)
 * cwd. This is the physical artifact the `feature-planner` produces and that
 * downstream read-only gates (especially `task-qa`) read from disk.
 */
export function planFilePath(taskId: string, cwd?: string): string {
	const base = cwd ?? process.cwd();
	return join(base, SESSIONS_DIR, `${taskId}-plan.json`);
}

/**
 * Persist the planner's plan as a standalone physical JSON file so a read-only
 * gate like `task-qa` can load it from disk (not just from the dispatch prompt).
 */
export function writePlanFile(taskId: string, plan: DevloopPlan, cwd?: string): void {
	const dir = join(cwd ?? process.cwd(), SESSIONS_DIR);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(planFilePath(taskId, cwd), JSON.stringify(plan, null, 2), "utf8");
}

export function createSession(taskId: string, cwd?: string): DevloopSession {
	const now = new Date().toISOString();
	return {
		schemaVersion: SESSION_SCHEMA_VERSION,
		taskId,
		startedAt: now,
		updatedAt: now,
		plan: null,
		ledger: [],
		status: "in-progress",
		currentStage: "planner",
	};
}

/**
 * Load a persisted session, returning `null` when absent or corrupt so the
 * controller can safely recreate from scratch.
 */
export function loadSession(taskId: string, cwd?: string): DevloopSession | null {
	const path = sessionPath(taskId, cwd);
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path, "utf8");
		const parsed = JSON.parse(raw) as DevloopSession;
		return parsed && parsed.taskId === taskId ? parsed : null;
	} catch {
		return null;
	}
}

/** Write the session to disk, refreshing `updatedAt` and creating the dir as needed. */
export function flushSession(session: DevloopSession, cwd?: string): void {
	const dir = join(cwd ?? process.cwd(), SESSIONS_DIR);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	session.updatedAt = new Date().toISOString();
	writeFileSync(sessionPath(session.taskId, cwd), JSON.stringify(session, null, 2), "utf8");
}

/** Remove a task's session file (e.g. on successful merge) if present. */
export function removeSession(taskId: string, cwd?: string): void {
	const path = sessionPath(taskId, cwd);
	if (existsSync(path)) {
		rmSync(path);
	}
}

/** Reduce a gate result to its persisted ledger entry. */
export function ledgerEntryFor(result: GateResult, agent: string): LedgerEntry {
	const entry: LedgerEntry = {
		stage: result.stage,
		agent,
		verdict: result.verdict,
		summary: result.summary,
		timestamp: new Date().toISOString(),
	};
	const findings = (result as { findings?: Finding[] }).findings;
	const corrections = (result as { corrections?: string[] }).corrections;
	if (findings) entry.findings = findings;
	if (corrections) entry.corrections = corrections;
	return entry;
}

/** Reduce the planner's structured slice result to the persisted plan. */
export function planFromResult(planned: PlannedSliceResult): DevloopPlan {
	return {
		summary: planned.summary,
		startingWorker: planned.startingWorker,
		skills: planned.skills ?? [],
		acceptanceCriteria: planned.acceptanceCriteria,
		docsNeeded: planned.docsNeeded,
		testPlan: planned.testPlan,
		generatedAt: new Date().toISOString(),
	};
}
