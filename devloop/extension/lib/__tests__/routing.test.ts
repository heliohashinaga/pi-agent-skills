import { describe, expect, test } from "bun:test";

import type { GateResult } from "../contracts";
import { createRunState, transition } from "../routing";

function result<T extends GateResult>(value: T): T {
	return value;
}

describe("devloop routing", () => {
	test("requires task-qa READY before implementation", () => {
		const planned = transition(
			createRunState(),
			result({
				stage: "planner",
				verdict: "PLANNED",
				startingWorker: "worker-simple",
				summary: "Implement the schema slice.",
				acceptanceCriteria: ["Schema rejects an invalid age band."],
				docsNeeded: false,
			}),
		);
		expect(planned.nextStage).toBe("task-qa");

		const clarification = transition(
			planned.state,
			result({
				stage: "task-qa",
				verdict: "CLARIFY_NEEDED",
				summary: "Boundary is ambiguous.",
				corrections: ["Specify the accepted age bands."],
			}),
		);
		expect(clarification.nextStage).toBe("planner");
		expect(clarification.state.attempts.criteria).toBe(1);
	});

	test("escalates a simple worker result to worker-complex without running gates", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "code" });
		const decision = transition(
			state,
			result({
				stage: "code",
				verdict: "ESCALATE",
				summary: "Contract change needs architectural reasoning.",
			}),
		);

		expect(decision.nextStage).toBe("code");
		expect(decision.state.currentWorker).toBe("worker-complex");
	});

	test("escalates an approved simple review to the complex review tier", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "review" });
		const decision = transition(
			state,
			result({
				stage: "review",
				verdict: "APPROVED",
				escalateToComplex: true,
				summary: "Implementation is correct but deserves deeper review.",
				findings: [],
			}),
		);

		expect(decision.nextStage).toBe("review");
		expect(decision.state.currentWorker).toBe("worker-complex");
	});

	test("routes a review rejection to the selected worker before tester", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "review" });
		const decision = transition(
			state,
			result({
				stage: "review",
				verdict: "CHANGES_REQUESTED",
				route: "worker-complex",
				summary: "Validation needs a redesign.",
				findings: [],
			}),
		);

		expect(decision.nextStage).toBe("code");
		expect(decision.state.currentWorker).toBe("worker-complex");
		expect(decision.state.attempts.review).toBe(1);
	});

	test("escalates an accepted simple test gate to the complex test tier", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "test" });
		const decision = transition(
			state,
			result({
				stage: "test",
				verdict: "MEETS_TASK",
				escalateToComplex: true,
				summary: "Core criteria pass but the test surface needs deeper coverage.",
				findings: [],
			}),
		);

		expect(decision.nextStage).toBe("test");
		expect(decision.state.currentWorker).toBe("worker-complex");
	});

	test("routes a failed tester gate back to the active worker", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "test" });
		const decision = transition(
			state,
			result({
				stage: "test",
				verdict: "DOES_NOT_MEET",
				summary: "The privacy criterion is untested.",
				findings: [],
			}),
		);

		expect(decision.nextStage).toBe("code");
		expect(decision.state.currentWorker).toBe("worker-simple");
		expect(decision.state.attempts.test).toBe(1);
	});

	test("routes a deep security rejection to worker-complex and blocks documentation", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "security-deep" });
		const decision = transition(
			state,
			result({
				stage: "security-deep",
				verdict: "SECURITY_CHANGES_REQUESTED",
				summary: "Provider payload can expose unsafe output.",
				findings: [
					{
						severity: "high",
						message: "Unsafe output reaches the response.",
						suggestedFix: "Add server-side validation.",
					},
				],
			}),
		);

		expect(decision.nextStage).toBe("code");
		expect(decision.state.currentWorker).toBe("worker-complex");
		expect(decision.state.attempts.security).toBe(1);
	});

	test("escalates to the deep security pass only when triage flags it", () => {
		const s0 = createRunState({ currentWorker: "worker-simple", docsNeeded: true, stage: "security" });
		const triage = transition(
			s0,
			result({
				stage: "security",
				verdict: "NEEDS_DEEP_REVIEW",
				summary: "Touches auth.",
				securitySensitive: true,
				triggers: ["auth / access control"],
			}),
		);
		expect(triage.nextStage).toBe("security-deep");

		const deep = transition(
			triage.state,
			result({ stage: "security-deep", verdict: "SECURE", summary: "Deep pass clear.", findings: [] }),
		);
		expect(deep.nextStage).toBe("documentation");
		expect(deep.state.attempts.security).toBe(0);
	});

	test("low-risk triage skips the deep security pass and documentation when docs are not needed", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "security" });
		const decision = transition(
			state,
			result({
				stage: "security",
				verdict: "LOW_RISK",
				summary: "Docs-only change.",
				securitySensitive: false,
				triggers: [],
			}),
		);
		expect(decision.nextStage).toBe("integrate");
	});

	test("contradictory low-risk triage signals fail closed into the deep pass", () => {
		const state = createRunState({ currentWorker: "worker-simple", stage: "security" });
		const decision = transition(
			state,
			result({
				stage: "security",
				verdict: "LOW_RISK",
				summary: "The model reported a contradictory auth trigger.",
				securitySensitive: true,
				triggers: ["auth / access control"],
			}),
		);
		expect(decision.nextStage).toBe("security-deep");	});

	test("reaches ready-to-merge only after every gate and final documentation pass", () => {
		let state = createRunState();
		state = transition(
			state,
			result({
				stage: "planner",
				verdict: "PLANNED",
				startingWorker: "worker-simple",
				summary: "A single scoped slice.",
				acceptanceCriteria: ["An observable result exists."],
				docsNeeded: true,
			}),
		).state;
		state = transition(
			state,
			result({ stage: "task-qa", verdict: "READY", summary: "Testable.", corrections: [] }),
		).state;
		state = transition(
			state,
			result({ stage: "code", verdict: "IMPLEMENTED", summary: "Implemented." }),
		).state;
		state = transition(
			state,
			result({ stage: "review", verdict: "APPROVED", summary: "Reviewed.", findings: [] }),
		).state;
		state = transition(
			state,
			result({ stage: "test", verdict: "MEETS_TASK", summary: "Tested.", findings: [] }),
		).state;
		state = transition(
			state,
			result({
				stage: "security",
				verdict: "LOW_RISK",
				summary: "Secure.",
				securitySensitive: false,
				triggers: [],
			}),
		).state;
		state = transition(
			state,
			result({ stage: "documentation", verdict: "DOCUMENTED", summary: "Documented." }),
		).state;

		expect(state.stage).toBe("integrate");

		const completed = transition(
			state,
			result({
				stage: "integrate",
				verdict: "INTEGRATED",
				summary: "Integrated.",
				branch: "devloop/T009",
				verification: ["bun test: pass"],
				tasksMarkedDone: ["T009"],
				prOpened: false,
				merged: false,
			}),
		);

		expect(completed.nextStage).toBe("ready-to-merge");
	});

	test("escalates a result that arrives out of stage order", () => {
		const decision = transition(
			createRunState({ stage: "review" }),
			result({ stage: "test", verdict: "MEETS_TASK", summary: "Unexpected.", findings: [] }),
		);

		expect(decision.nextStage).toBe("human-escalation");
	});

	test("escalates to a human after the retry budget is exhausted", () => {
		const state = createRunState({
			currentWorker: "worker-simple",
			stage: "test",
			attempts: { criteria: 0, review: 0, test: 3, security: 0 },
		});
		const decision = transition(
			state,
			result({
				stage: "test",
				verdict: "PARTIAL",
				summary: "Still incomplete after remediation.",
				findings: [],
			}),
		);

		expect(decision.nextStage).toBe("human-escalation");
		expect(decision.reason).toContain("retry limit");
	});
});
