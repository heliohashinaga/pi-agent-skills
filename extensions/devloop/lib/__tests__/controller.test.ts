import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runController } from "../controller";
import { DevloopDelegationError } from "../errors";
import type { GateResult, GateStage } from "../contracts";
import type { PipelineEvent } from "../pipeline";

function nextResult(call: GateStage, taskId = "T009"): GateResult {
	switch (call) {
		case "planner":
			return {
				stage: "planner",
				verdict: "PLANNED",
				startingWorker: "worker-simple",
				skills: ["dotnet"],
				summary: "A single scoped slice.",
				acceptanceCriteria: ["An observable result exists."],
				docsNeeded: false,
				testPlan: {
					rationale: "Small slice: lean unit coverage of the observable result.",
					entries: [
						{
							criterion: "An observable result exists.",
							unit: ["returns the observable result"],
							contract: ["pipeline returns the expected shape"],
						},
					],
				},
			};
		case "task-qa":
			return { stage: "task-qa", verdict: "READY", summary: "Testable.", corrections: [] };
		case "code":
			return { stage: "code", verdict: "IMPLEMENTED", summary: "Implemented." };
		case "review":
			return { stage: "review", verdict: "APPROVED", summary: "Approved.", findings: [] };
		case "test":
			return { stage: "test", verdict: "MEETS_TASK", summary: "Tested.", findings: [] };
		case "security":
			return {
				stage: "security",
				verdict: "LOW_RISK",
				summary: "Secure.",
				securitySensitive: false,
				triggers: [],
			};
		case "security-deep":
			return { stage: "security-deep", verdict: "SECURE", summary: "Deep secure.", findings: [] };
		case "documentation":
			return { stage: "documentation", verdict: "DOCUMENTED", summary: "Documented." };
		case "integrate":
			return {
				stage: "integrate",
				verdict: "INTEGRATED",
				summary: "Integrated.",
				branch: `devloop/${taskId}`,
				verification: ["bun test: pass"],
				tasksMarkedDone: [taskId], // exact match required
				prOpened: false,
				merged: false,
			};
	}
}

function agentForStage(stage: GateStage): string {
	switch (stage) {
		case "planner": return "feature-planner";
		case "task-qa": return "task-qa";
		case "review": return "reviewer-simple";
		case "test": return "tester-simple";
		case "security": return "security-triage";
		case "security-deep": return "security-reviewer";
		case "code":
		case "documentation": return "worker-simple";
		case "integrate": return "integrator";
	}
}

describe("devloop controller", () => {
	// Each test writes its session ledger into a throwaway temp dir so runs stay
	// deterministic and never side-effect the source tree.
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "devloop-controller-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("runs every gate in order and reaches ready-to-merge", async () => {
		const task = { id: "T009", description: "Write failing tests." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				called.push(agentForStage(stage));
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(called).toEqual([
			"feature-planner", "task-qa", "worker-simple",
			"reviewer-simple", "tester-simple", "security-triage", "integrator",
		]);
	});

	test("routes E2E/visual testPlan to tester-complex without promoting worker/review", async () => {
		const task = { id: "T023", description: "pt-BR generation E2E journey." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, agent }) => {
				called.push(agent!);
				if (stage === "planner") {
					return {
						stage: "planner",
						verdict: "PLANNED",
						startingWorker: "worker-simple",
						skills: ["typescript"],
						summary: "E2E journey.",
						acceptanceCriteria: ["Payload has no identifier."],
						docsNeeded: false,
						testPlan: {
							rationale: "E2E journey requires a browser.",
							entries: [
								{
									criterion: "Payload has no identifier.",
									unit: [],
									e2e: ["pt-BR journey sends only ageBand/locale/theme"],
								},
							],
						},
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		// worker + review stay on the simple tier; only the test stage is upgraded
		expect(called).toContain("worker-simple");
		expect(called).toContain("reviewer-simple");
		expect(called).toContain("tester-complex");
		expect(called).not.toContain("tester-simple");
		expect(called).not.toContain("worker-complex");
		expect(called).not.toContain("reviewer-complex");
	});

	test("re-runs the planner when task-qa asks for clarification", async () => {
		const task = { id: "T011", description: "Define catalogs." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				called.push(agentForStage(stage));
				if (stage === "task-qa") {
					return called.filter((e) => e === "task-qa").length === 1
						? { stage: "task-qa", verdict: "CLARIFY_NEEDED", summary: "Ambiguous.", corrections: ["Be precise."] }
						: { stage: "task-qa", verdict: "READY", summary: "Precise.", corrections: [] };
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(called.filter((e) => e === "feature-planner")).toHaveLength(2);
	});

	test("salvages code timeout with worker-complex before human escalation", async () => {
		const task = { id: "T027", description: "Heavy E2E task." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, agent }) => {
				called.push(agent!);
				if (stage === "code") {
					// First call: worker-simple times out
					if (agent === "worker-simple") {
						throw new DevloopDelegationError("timed_out", "worker-simple timed out", { agent });
					}
					// Second call (salvage): worker-complex succeeds
					return { stage: "code", verdict: "IMPLEMENTED", summary: "Salvaged." };
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		// worker-simple timed out → salvaged with worker-complex
		expect(called.filter((a) => a === "worker-simple")).toHaveLength(1);
		expect(called.filter((a) => a === "worker-complex")).toHaveLength(1);
		expect(called).toContain("worker-complex");
	});

	test("code timeout salvage exhausted goes to human-escalation", async () => {
		const task = { id: "T028", description: "Unsalvageable task." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, agent }) => {
				called.push(agent!);
				if (stage === "code") {
					// Both worker-simple and worker-complex time out
					throw new DevloopDelegationError("timed_out", `${agent} timed out`, { agent });
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("human-escalation");
		expect(output.reason).toContain("timed out");
		// Tried worker-simple, then worker-complex (salvage), then gave up
		expect(called.filter((a) => a === "worker-simple")).toHaveLength(1);
		expect(called.filter((a) => a === "worker-complex")).toHaveLength(1);
	});

	test("retries a worker-complex code timeout once with a fresh budget", async () => {
		const task = { id: "T029", description: "Complex slice that times out once." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, agent }) => {
				called.push(agent!);
				if (stage === "planner") {
					return { ...nextResult(stage, task.id), startingWorker: "worker-complex" };
				}
				if (stage === "code") {
					// First worker-complex budget times out; the retry succeeds.
					if (called.filter((a) => a === "worker-complex").length === 1) {
						throw new DevloopDelegationError("timed_out", "worker-complex timed out", { agent });
					}
					return { stage: "code", verdict: "IMPLEMENTED", summary: "Finalized partial work." };
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		// worker-complex timed out on its first budget, was retried, and succeeded.
		expect(called.filter((a) => a === "worker-complex")).toHaveLength(2);
	});

	test("worker-complex code timeout exhausts salvage to human-escalation", async () => {
		const task = { id: "T030", description: "Complex slice that keeps timing out." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, agent }) => {
				called.push(agent!);
				if (stage === "planner") {
					return { ...nextResult(stage, task.id), startingWorker: "worker-complex" };
				}
				if (stage === "code") {
					// Every worker-complex budget times out.
					throw new DevloopDelegationError("timed_out", "worker-complex timed out", { agent });
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("human-escalation");
		expect(output.reason).toContain("timed out");
		// Salvaged exactly once (2 attempts total) before escalating to human.
		expect(called.filter((a) => a === "worker-complex")).toHaveLength(2);
	});

	test("planner prompt explicitly requires docsNeeded and skills allowlist", async () => {
		let plannerPromptText = "";
		const task = { id: "T022", description: "Plan a slice with docs." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, prompt }) => {
				if (stage === "planner") plannerPromptText = prompt;
				return nextResult(stage, task.id);
			},
		});
		expect(output.status).toBe("ready-to-merge");
		expect(plannerPromptText).toContain("docsNeeded (a boolean)");
		expect(plannerPromptText).toContain("docsNeeded is required");
		expect(plannerPromptText).toContain("design-system");
	});

	test("implementation always receives dedupe([...plannerSkills,'gitmoji']) even when plannerSkills empty", async () => {
		const skillByStage: Record<string, string[] | undefined> = {};
		const task = { id: "T026", description: "Empty planner skills → gitmoji only." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, skills }) => {
				skillByStage[stage] = skills;
				if (stage === "planner") {
					return {
						stage: "planner", verdict: "PLANNED",
						startingWorker: "worker-simple",
						skills: [], // empty
						summary: "Empty skills slice.",
						acceptanceCriteria: ["C."],
						docsNeeded: false,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(skillByStage["code"]).toEqual(["gitmoji"]);
	});

	test("implementation deduplicates overlapping planner skills + gitmoji", async () => {
		const skillByStage: Record<string, string[] | undefined> = {};
		const task = { id: "T027", description: "Dup skills test." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, skills }) => {
				skillByStage[stage] = skills;
				if (stage === "planner") {
					return {
						stage: "planner", verdict: "PLANNED",
						startingWorker: "worker-simple",
						skills: ["dotnet", "gitmoji"], // gitmoji already present
						summary: "Dup.",
						acceptanceCriteria: ["C."],
						docsNeeded: false,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(skillByStage["code"]!.filter((s) => s === "gitmoji")).toHaveLength(1);
	});

	test("implementation filters invalid skills via allowlist", async () => {
		const skillByStage: Record<string, string[] | undefined> = {};
		const task = { id: "T028", description: "Invalid skill filtering." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, skills }) => {
				skillByStage[stage] = skills;
				if (stage === "planner") {
					return {
						stage: "planner", verdict: "PLANNED",
						startingWorker: "worker-simple",
						skills: ["dotnet", "nonexistent-skill", "malware"],
						summary: "Bad skills.",
						acceptanceCriteria: ["C."],
						docsNeeded: false,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(skillByStage["code"]).toContain("dotnet");
		expect(skillByStage["code"]).toContain("gitmoji");
		expect(skillByStage["code"]).not.toContain("nonexistent-skill");
		expect(skillByStage["code"]).not.toContain("malware");
	});

	test("attaches the planner's skills (plus gitmoji) to the worker", async () => {
		const skillByStage: Record<string, string[] | undefined> = {};
		const task = { id: "T012", description: "Build a thin service." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, skills }) => {
				skillByStage[stage] = skills;
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(skillByStage["code"]).toEqual(["dotnet", "gitmoji"]);
		expect(skillByStage["review"]).toBeUndefined();
		expect(skillByStage["security"]).toBeUndefined();
	});

	test("escalates an approved simple review to reviewer-complex", async () => {
		const task = { id: "T013", description: "A slice whose review scope expands." };
		const reviewAgents: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, agent }) => {
				if (stage === "review") {
					reviewAgents.push(agent);
					if (reviewAgents.length === 1) {
						return {
							stage: "review", verdict: "APPROVED", escalateToComplex: true,
							summary: "Need a deeper review tier.", findings: [],
						};
					}
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(reviewAgents).toEqual(["reviewer-simple", "reviewer-complex"]);
	});

	test("dispatches worker-complex and the -complex review/test for a complex slice", async () => {
		const task = { id: "T014", description: "Complex multi-file refactor." };
		const codeAgents: string[] = [];
		const reviewAgents: string[] = [];
		const testAgents: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, agent }) => {
				if (stage === "code") codeAgents.push(agent);
				if (stage === "review") reviewAgents.push(agent);
				if (stage === "test") testAgents.push(agent);
				if (stage === "planner") {
					return {
						stage: "planner", verdict: "PLANNED",
						startingWorker: "worker-complex", skills: ["dotnet"],
						summary: "Complex slice.", acceptanceCriteria: ["C."], docsNeeded: false,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(codeAgents).toEqual(["worker-complex"]);
		expect(reviewAgents).toEqual(["reviewer-complex"]);
		expect(testAgents).toEqual(["tester-complex"]);
	});

	test("passes the full evidence ledger and default no-PR policy to integration", async () => {
		let integratePrompt = "";
		const task = { id: "T015", description: "Verify integration evidence." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, prompt }) => {
				if (stage === "integrate") integratePrompt = prompt;
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(integratePrompt).toContain("Structured gate evidence ledger");
		expect(integratePrompt).toContain("do not open or update a PR");
	});

	test("passes the configured task path to integration", async () => {
		let integratePrompt = "";
		const task = { id: "T015", description: "Verify custom task tracking." };
		const output = await runController({
			task,
			cwd,
			tasksPath: "specs/feature/tasks.md",
			delegate: async ({ stage, prompt }) => {
				if (stage === "integrate") integratePrompt = prompt;
				return nextResult(stage, task.id);
			},
		});
		expect(output.status).toBe("ready-to-merge");
		expect(integratePrompt).toContain("specs/feature/tasks.md");
	});

	test("fails closed when the committed task tracking state is not complete and clean", async () => {
		const task = { id: "T015", description: "Verify task tracking state." };
		const output = await runController({
			task,
			cwd,
			verifyTaskTracking: async () => ({ completed: true, clean: false }),
			delegate: async ({ stage }) => nextResult(stage, task.id),
		});
		expect(output.status).toBe("human-escalation");
		expect(output.reason).toContain("completed=true, clean=false");
	});

	test("rejects tasksMarkedDone not exactly [task.id]", async () => {
		const task = { id: "T025", description: "Task tracking exact validation." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				if (stage === "integrate") {
					return {
						stage: "integrate", verdict: "INTEGRATED", summary: "Bad tracking.",
						branch: "devloop/T025", verification: ["bun test: pass"],
						tasksMarkedDone: ["T025", "T999"], // extra entry
						prOpened: false, merged: false,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("human-escalation");
		expect(output.reason).toContain('["T025"]');
	});

	test("rejects integration with wrong single task", async () => {
		const task = { id: "T025", description: "Wrong single task." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				if (stage === "integrate") {
					return {
						stage: "integrate", verdict: "INTEGRATED", summary: "Wrong.",
						branch: "devloop/T025", verification: ["bun test: pass"],
						tasksMarkedDone: ["T999"], // wrong task
						prOpened: false, merged: false,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("human-escalation");
		expect(output.reason).toContain("T999");
	});

	test("blocks a PR reported without the explicit --pr authorization", async () => {
		const task = { id: "T016", description: "Reject unauthorized publication." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				if (stage === "integrate") {
					return {
						stage: "integrate", verdict: "INTEGRATED",
						summary: "Opened a PR unexpectedly.", branch: "devloop/T016",
						verification: ["bun test: pass"],
						tasksMarkedDone: ["T016"], prOpened: true,
						prUrl: "https://example.test/pr/16", merged: false,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("human-escalation");
		expect(output.reason).toContain("--pr");
	});

	test("dispatches the deep security reviewer only when triage flags it", async () => {
		const task = { id: "T013", description: "Add authentication to a login endpoint." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				called.push(agentForStage(stage));
				if (stage === "security") {
					return {
						stage: "security", verdict: "NEEDS_DEEP_REVIEW",
						summary: "Touches auth.", securitySensitive: true,
						triggers: ["auth / access control"],
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(called).toContain("security-triage");
		expect(called).toContain("security-reviewer");
	});

	test("escalates to a human when a gate exhausts its retry budget", async () => {
		const task = { id: "T010", description: "Implement schema." };
		let workerCalls = 0;
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				if (stage === "test") return { stage: "test", verdict: "DOES_NOT_MEET", summary: "No.", findings: [] };
				if (stage === "code") {
					workerCalls += 1;
					if (workerCalls > 3) return { stage: "code", verdict: "HUMAN_ESCALATION", summary: "Stuck." };
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("human-escalation");
	});

	test("includes the resolved child model in a stage:start event", async () => {
		const events: PipelineEvent[] = [];
		const task = { id: "T019", description: "Show the running child model." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => nextResult(stage, task.id),
			resolveModel: (agent) =>
				agent === "feature-planner" ? "openrouter/deepseek/deepseek-v4-pro" : undefined,
			onEvent: (event) => events.push(event),
		});

		expect(output.status).toBe("ready-to-merge");
		expect(events.find((e) => e.type === "stage:start" && e.stage === "planner")).toMatchObject({
			model: "openrouter/deepseek/deepseek-v4-pro",
		});
	});

	test("emits pipeline events through onEvent in dispatch order", async () => {
		const events: string[] = [];
		const task = { id: "T020", description: "Visualization wiring." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => nextResult(stage, task.id),
			onEvent: (event) => events.push(event.type),
		});

		expect(output.status).toBe("ready-to-merge");
		expect(events).toEqual([
			"stage:start", "stage:done", "stage:start", "stage:done",
			"stage:start", "stage:done", "stage:start", "stage:done",
			"stage:start", "stage:done", "stage:start", "stage:done",
			"stage:start", "stage:done", "run:end",
		]);
	});

	test("emits run:end human-escalation when a gate delegate throws", async () => {
		const events: string[] = [];
		const task = { id: "T021", description: "Failing gate." };
		const output = await runController({
			task,
			cwd,
			delegate: async () => { throw new Error("boom"); },
			onEvent: (event) => events.push(event.type),
		});

		expect(output.status).toBe("human-escalation");
		expect(events).toEqual(["stage:start", "stage:failed", "run:end"]);
	});

	test("includes planner slice context as JSON in downstream gate prompts", async () => {
		const prompts: Record<string, string> = {};
		const task = { id: "T023", description: "Plan context handoff." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, prompt }) => {
				prompts[stage] = prompt;
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		for (const s of ["task-qa", "code", "review", "test", "security"]) {
			expect(prompts[s]).toContain("Planner slice context");
			expect(prompts[s]).toContain('"acceptanceCriteria"');
		}
	});

	test("attaches docs + gitmoji skills to the documentation stage", async () => {
		const skillByStage: Record<string, string[] | undefined> = {};
		const task = { id: "T024", description: "Documentation skill attach." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, skills }) => {
				skillByStage[stage] = skills;
				if (stage === "planner") {
					return {
						stage: "planner", verdict: "PLANNED",
						startingWorker: "worker-simple", skills: ["dotnet"],
						summary: "Slice needing docs.",
						acceptanceCriteria: ["Criterion."], docsNeeded: true,
					};
				}
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(skillByStage["documentation"]).toContain("gitmoji");
		expect(skillByStage["documentation"]).toContain("docs");
	});

	test("creates a persisted session ledger with the planner plan and every gate verdict", async () => {
		const task = { id: "T030", description: "Persist ledger across gates." };
		const called: string[] = [];
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => {
				called.push(stage);
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");

		const raw = readFileSync(join(cwd, ".pi/devloop/sessions", "T030.json"), "utf8");
		const session = JSON.parse(raw);
		expect(session.taskId).toBe("T030");
		expect(session.status).toBe("ready-to-merge");
		expect(session.plan).toMatchObject({
			summary: "A single scoped slice.",
			startingWorker: "worker-simple",
			docsNeeded: false,
		});

		// The planner's plan is ALSO physically persisted to a standalone JSON
		// file so read-only gates (task-qa) can load it from disk.
		const planRaw = readFileSync(join(cwd, ".pi/devloop/sessions", "T030-plan.json"), "utf8");
		const planFile = JSON.parse(planRaw);
		expect(planFile).toMatchObject({
			summary: "A single scoped slice.",
			startingWorker: "worker-simple",
			docsNeeded: false,
		});
		expect(planFile.acceptanceCriteria).toEqual(["An observable result exists."]);
		expect(planFile.testPlan).toEqual({
			rationale: "Small slice: lean unit coverage of the observable result.",
			entries: [
				{
					criterion: "An observable result exists.",
					unit: ["returns the observable result"],
					contract: ["pipeline returns the expected shape"],
				},
			],
		});

		// planner + task-qa + code + review + test + security + integrate
		expect(session.ledger.map((e: { stage: string }) => e.stage)).toEqual([
			"planner", "task-qa", "code", "review", "test", "security", "integrate",
		]);
	});

	test("injects the session file pointer into downstream gate prompts", async () => {
		const prompts: Record<string, string> = {};
		const task = { id: "T031", description: "Pointer handoff." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage, prompt }) => {
				prompts[stage] = prompt;
				return nextResult(stage, task.id);
			},
		});

		expect(output.status).toBe("ready-to-merge");
		expect(prompts["task-qa"]).toContain("Session ledger (prior gates)");
		expect(prompts["task-qa"]).toContain(join(cwd, ".pi/devloop/sessions", "T031.json"));
		// task-qa is told to read the physically-persisted plan JSON from disk.
		expect(prompts["task-qa"]).toContain("Planner plan JSON (physical file)");
		expect(prompts["task-qa"]).toContain(join(cwd, ".pi/devloop/sessions", "T031-plan.json"));
		expect(prompts["task-qa"]).toContain("returns the observable result"); // testPlan flows via planContext
		expect(prompts["code"]).toContain("Session ledger (prior gates)");
	});

	test("reloads an existing session instead of clobbering prior validation", async () => {
		const dir = join(cwd, ".pi/devloop/sessions");
		mkdirSync(dir, { recursive: true });
		const prior = {
			schemaVersion: 1,
			taskId: "T032",
			startedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			plan: null,
			ledger: [
				{ stage: "planner", agent: "feature-planner", verdict: "PLANNED", summary: "Prior.", timestamp: new Date().toISOString() },
			],
			status: "in-progress",
			currentStage: "task-qa",
		};
		writeFileSync(join(dir, "T032.json"), JSON.stringify(prior), "utf8");

		const task = { id: "T032", description: "Resume from persisted session." };
		const output = await runController({
			task,
			cwd,
			delegate: async ({ stage }) => nextResult(stage, task.id),
		});

		expect(output.status).toBe("ready-to-merge");
		const raw = readFileSync(join(dir, "T032.json"), "utf8");
		const session = JSON.parse(raw);
		// Original ledger entry survives and later gates were appended.
		expect(session.ledger[0].summary).toBe("Prior.");
		expect(session.ledger.some((e: { stage: string }) => e.stage === "integrate")).toBe(true);
	});
});