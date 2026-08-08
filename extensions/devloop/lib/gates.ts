import type {
	Finding,
	GateResult,
	GateStage,
	PlannedSliceResult,
	TestPlan,
} from "./contracts";
import { ALLOWED_SKILLS } from "./contracts";
import type { TaskDefinition } from "./task";
import { genericPrompt, integratePrompt, plannerPrompt, planContextJson } from "./prompts";

/**
 * Data-driven gate table + cost-controlled agent/tier selection.
 *
 * The pipeline is defined as a table of `GateSpec`s (data, not closures on
 * controller state) so the structure of the loop is readable in one place and
 * the subtle "tester tier" rule can be tested in isolation. The controller now
 * only owns the run loop, session persistence, and integrate validation.
 */

export type GatePromptFn = (
	task: TaskDefinition,
	feedback: string,
	planContext?: string,
	sessionFile?: string,
	planFile?: string,
) => string;

export interface GateSpec {
	agent: string;
	/** Lighter/cheaper agent for this stage, used when the worker tier is `worker-simple`. */
	lightAgent?: string;
	stage: GateStage;
	prompt: GatePromptFn;
}

/** The full gate table. The `code` and `documentation` agents are defaults; the
 *  controller overrides them at dispatch (code → state.currentWorker,
 *  documentation → worker-simple). */
export const gateSpecs: Record<GateStage, GateSpec> = {
	planner: { agent: "feature-planner", stage: "planner", prompt: plannerPrompt },
	"task-qa": { agent: "task-qa", stage: "task-qa", prompt: genericPrompt("task-qa") },
	code: {
		agent: "worker-simple", // default; overridden by state.currentWorker at dispatch
		stage: "code",
		prompt: genericPrompt("code"),
	},
	review: {
		agent: "reviewer-complex",
		lightAgent: "reviewer-simple",
		stage: "review",
		prompt: genericPrompt("review"),
	},
	test: {
		agent: "tester-complex",
		lightAgent: "tester-simple",
		stage: "test",
		prompt: genericPrompt("test"),
	},
	security: { agent: "security-triage", stage: "security", prompt: genericPrompt("security") },
	"security-deep": {
		agent: "security-reviewer",
		stage: "security-deep",
		prompt: genericPrompt("security-deep"),
	},
	documentation: {
		agent: "worker-simple",
		stage: "documentation",
		prompt: genericPrompt("documentation"),
	},
	integrate: {
		agent: "integrator",
		stage: "integrate",
		prompt: genericPrompt("integrate"),
	},
};

/** Skills selected for the planner output, deduped against the allowlist. */
export function dedupeSkills(skills: string[]): string[] {
	return [...new Set(skills.filter((s) => (ALLOWED_SKILLS as readonly string[]).includes(s)))];
}

/**
 * True when any testPlan entry asks for E2E (Playwright journeys) or visual
 * (Storybook) verification, which requires booting an app/browser and a strong
 * model to analyze the result. Such slices MUST go to `tester-complex`
 * regardless of the worker tier, so a mis-tiered planner cannot silently
 * under-verify a journey with a flash `tester-simple`. Cost control: this only
 * upgrades the `test` stage; worker/review stay on the tier they warrant.
 */
export function testPlanNeedsComplexTester(testPlan: TestPlan | undefined): boolean {
	return (testPlan?.entries ?? []).some(
		(entry) =>
			(entry.e2e !== undefined && entry.e2e.length > 0) ||
			(entry.visual !== undefined && entry.visual.length > 0),
	);
}

/**
 * Select the agent for a stage under the cost-controlled tester tier rule.
 *
 * - `code` always uses the current worker tier (`state.currentWorker`).
 * - `test` uses the complex tester when the planner's testPlan demands E2E/visual,
 *   regardless of worker tier; otherwise it follows the worker tier (light agent
 *   when the worker is `worker-simple` and a light tester exists).
 * - Every other stage follows the worker tier: light agent when the worker is
 *   `worker-simple` and a light agent exists, else the stage's default agent.
 *
 * Pure function of (spec, stage, currentWorker, testPlan) — no I/O, no session.
 */
export function selectAgent(
	spec: GateSpec,
	stage: GateStage,
	currentWorker: "worker-simple" | "worker-complex",
	testPlan: TestPlan | undefined,
): string {
	if (stage === "code") return currentWorker;
	if (stage === "test" && testPlanNeedsComplexTester(testPlan)) return spec.agent;
	if (currentWorker === "worker-simple" && spec.lightAgent) return spec.lightAgent;
	return spec.agent;
}

/** Format the human-readable feedback string a gate result feeds to the next gate. */
export function feedbackFor(result: GateResult): string {
	switch (result.stage) {
		case "task-qa":
			return result.verdict === "CLARIFY_NEEDED"
				? `task-qa requested corrections:\n${result.corrections.join("\n")}`
				: "";
		case "review":
		case "test":
		case "security-deep":
			return result.findings.length > 0
				? `${result.stage}: ${result.summary}\n${result.findings
						.map(
							(finding: Finding) =>
								`- [${finding.severity}] ${finding.message}${finding.file ? ` (${finding.file})` : ""}`,
						)
						.join("\n")}`
				: result.summary;
		case "security":
			return result.summary;
		default:
			return "";
	}
}

/** Re-exported for callers that previously imported it from the controller. */
export { integratePrompt, planContextJson };
export type { PlannedSliceResult };
