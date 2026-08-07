import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	createSession,
	flushSession,
	ledgerEntryFor,
	loadSession,
	planFromResult,
	removeSession,
	sessionPath,
	SESSIONS_DIR,
} from "../session";
import type { GateResult } from "../contracts";

describe("devloop session ledger", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "devloop-session-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("createSession returns a fresh in-progress session", () => {
		const s = createSession("T100", cwd);
		expect(s.schemaVersion).toBe(1);
		expect(s.taskId).toBe("T100");
		expect(s.status).toBe("in-progress");
		expect(s.currentStage).toBe("planner");
		expect(s.plan).toBeNull();
		expect(s.ledger).toEqual([]);
	});

	test("flushSession writes a readable JSON file under the cwd sessions dir", () => {
		const s = createSession("T101", cwd);
		flushSession(s, cwd);
		const path = sessionPath("T101", cwd);
		expect(path).toBe(join(cwd, SESSIONS_DIR, "T101.json"));
		expect(existsSync(path)).toBe(true);
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		expect(parsed.taskId).toBe("T101");
		expect(parsed.updatedAt).toBeDefined();
	});

	test("loadSession returns null when absent and the session when present", () => {
		expect(loadSession("T102", cwd)).toBeNull();
		const s = createSession("T102", cwd);
		flushSession(s, cwd);
		expect(loadSession("T102", cwd)?.taskId).toBe("T102");
	});

	test("loadSession returns null on corrupt JSON", () => {
		const dir = join(cwd, SESSIONS_DIR);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "T103.json"), "{ not valid json", "utf8");
		expect(loadSession("T103", cwd)).toBeNull();
	});

	test("loadSession rejects a mismatched taskId", () => {
		// A file whose contents claim a different task should not be trusted.
		const dir = join(cwd, SESSIONS_DIR);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "T104.json"),
			JSON.stringify({ taskId: "OTHER" }),
			"utf8",
		);
		expect(loadSession("T104", cwd)).toBeNull();
	});

	test("removeSession deletes only its own file", () => {
		const a = createSession("T105", cwd);
		const b = createSession("T106", cwd);
		flushSession(a, cwd);
		flushSession(b, cwd);
		removeSession("T105", cwd);
		expect(existsSync(sessionPath("T105", cwd))).toBe(false);
		expect(existsSync(sessionPath("T106", cwd))).toBe(true);
	});

	test("ledgerEntryFor captures verdict, summary, findings and corrections", () => {
		const result = {
			stage: "review",
			verdict: "CHANGES_REQUESTED",
			summary: "Tighten typing.",
			findings: [{ severity: "high", message: "any leak", file: "src/x.ts" }],
		} as unknown as GateResult;
		const entry = ledgerEntryFor(result, "reviewer-simple");
		expect(entry.stage).toBe("review");
		expect(entry.agent).toBe("reviewer-simple");
		expect(entry.verdict).toBe("CHANGES_REQUESTED");
		expect(entry.findings).toHaveLength(1);
		expect(entry.timestamp).toBeDefined();
	});

	test("ledgerEntryFor persists task-qa corrections", () => {
		const result = {
			stage: "task-qa",
			verdict: "CLARIFY_NEEDED",
			summary: "Ambiguous criteria.",
			corrections: ["Scope the first scene."],
		} as unknown as GateResult;
		expect(ledgerEntryFor(result, "task-qa").corrections).toEqual([
			"Scope the first scene.",
		]);
	});

	test("planFromResult reduces the planner slice to the persisted plan", () => {
		const planned = {
			stage: "planner",
			verdict: "PLANNED",
			startingWorker: "worker-complex",
			skills: ["nextjs"],
			summary: "A scoped slice.",
			acceptanceCriteria: ["Renders a scene."],
			docsNeeded: true,
			testPlan: {
				rationale: "Complex slice: E2E + visual coverage.",
				entries: [
					{
						criterion: "Renders a scene.",
						unit: ["scene renders"],
						visual: ["reader default story"],
					},
				],
			},
		} as const;
		const plan = planFromResult(planned);
		expect(plan.startingWorker).toBe("worker-complex");
		expect(plan.docsNeeded).toBe(true);
		expect(plan.acceptanceCriteria).toEqual(["Renders a scene."]);
		expect(plan.testPlan).toEqual({
			rationale: "Complex slice: E2E + visual coverage.",
			entries: [
				{
					criterion: "Renders a scene.",
					unit: ["scene renders"],
					visual: ["reader default story"],
				},
			],
		});
		expect(plan.generatedAt).toBeDefined();
	});
});
