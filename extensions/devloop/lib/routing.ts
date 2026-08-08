import type { GateResult, PipelineStage, WorkerName } from "./contracts";

export const RETRY_LIMITS = {
	criteria: 2,
	review: 3,
	test: 3,
	security: 3,
} as const;

export interface AttemptCounts {
	criteria: number;
	review: number;
	test: number;
	security: number;
}

export interface RunState {
	stage: PipelineStage;
	currentWorker: WorkerName;
	docsNeeded: boolean;
	attempts: AttemptCounts;
}

export interface RunTransition {
	state: RunState;
	nextStage: PipelineStage;
	reason: string;
}

export interface CreateRunStateOptions {
	stage?: PipelineStage;
	currentWorker?: WorkerName;
	docsNeeded?: boolean;
	attempts?: Partial<AttemptCounts>;
}

const defaultAttempts: AttemptCounts = {
	criteria: 0,
	review: 0,
	test: 0,
	security: 0,
};

export function createRunState(options: CreateRunStateOptions = {}): RunState {
	return {
		stage: options.stage ?? "planner",
		currentWorker: options.currentWorker ?? "worker-simple",
		docsNeeded: options.docsNeeded ?? false,
		attempts: { ...defaultAttempts, ...options.attempts },
	};
}

function transitionTo(state: RunState, nextStage: PipelineStage, reason: string, currentWorker = state.currentWorker): RunTransition {
	return {
		state: { ...state, stage: nextStage, currentWorker },
		nextStage,
		reason,
	};
}

function humanEscalation(state: RunState, reason: string): RunTransition {
	return transitionTo(state, "human-escalation", reason);
}

function retryWorker(
	state: RunState,
	attempt: keyof Pick<AttemptCounts, "review" | "test" | "security">,
	worker: WorkerName,
	reason: string,
): RunTransition {
	const nextAttempt = state.attempts[attempt] + 1;
	if (nextAttempt > RETRY_LIMITS[attempt]) {
		return humanEscalation(state, `${reason}; retry limit (${RETRY_LIMITS[attempt]}) exhausted.`);
	}

	return {
		state: {
			...state,
			stage: "code",
			currentWorker: worker,
			attempts: { ...state.attempts, [attempt]: nextAttempt },
		},
		nextStage: "code",
		reason,
	};
}

function retryPlanner(state: RunState, reason: string): RunTransition {
	const nextAttempt = state.attempts.criteria + 1;
	if (nextAttempt > RETRY_LIMITS.criteria) {
		return humanEscalation(state, `${reason}; retry limit (${RETRY_LIMITS.criteria}) exhausted.`);
	}

	return {
		state: {
			...state,
			stage: "planner",
			attempts: { ...state.attempts, criteria: nextAttempt },
		},
		nextStage: "planner",
		reason,
	};
}

function stageMismatch(state: RunState, result: GateResult): RunTransition {
	return humanEscalation(
		state,
		`Received a ${result.stage} result while the controller expected ${state.stage}.`,
	);
}

function nextAfterSecurity(state: RunState, reason: string): RunTransition {
	return transitionTo(state, state.docsNeeded ? "documentation" : "integrate", reason);
}

export function transition(state: RunState, result: GateResult): RunTransition {
	if (state.stage !== result.stage) return stageMismatch(state, result);

	switch (result.stage) {
		case "planner": {
			const planned = transitionTo(
				state,
				"task-qa",
				"Planner produced a scoped slice; task-qa must validate its criteria.",
				result.startingWorker,
			);
			return { ...planned, state: { ...planned.state, docsNeeded: result.docsNeeded } };
		}

		case "task-qa":
			if (result.verdict === "READY") {
				return transitionTo(state, "code", "Criteria are ready for implementation.");
			}
			return retryPlanner(state, "task-qa requested clarification before implementation");

		case "code":
			if (result.verdict === "IMPLEMENTED") {
				return transitionTo(state, "review", "Implementation completed; reviewer is the next gate.");
			}
			if (result.verdict === "ESCALATE") {
				return transitionTo(
					state,
					"code",
					"worker-simple escalated; route directly to worker-complex before any gate.",
					"worker-complex",
				);
			}
			return humanEscalation(state, "Implementation worker requested human escalation.");

		case "review":
			if (result.verdict === "APPROVED" && result.escalateToComplex) {
				if (state.currentWorker === "worker-complex") {
					return humanEscalation(state, "Complex reviewer requested another tier escalation.");
				}
				return transitionTo(state, "review", "Simple reviewer requested the complex review tier.", "worker-complex");
			}
			if (result.verdict === "APPROVED") {
				return transitionTo(state, "test", "Reviewer approved; tester is the next gate.");
			}
			if (result.verdict === "HUMAN_ESCALATION" || result.route === "human") {
				return humanEscalation(state, "Reviewer requested human escalation.");
			}
			return retryWorker(
				state,
				"review",
				result.route ?? state.currentWorker,
				"Reviewer requested changes before tester runs",
			);

		case "test":
			if (result.verdict === "MEETS_TASK" && result.escalateToComplex) {
				if (state.currentWorker === "worker-complex") {
					return humanEscalation(state, "Complex tester requested another tier escalation.");
				}
				return transitionTo(state, "test", "Simple tester requested the complex test tier.", "worker-complex");
			}
			if (result.verdict === "MEETS_TASK") {
				return transitionTo(state, "security", "Tester confirmed task conformance; security is the next gate.");
			}
			if (result.verdict === "HUMAN_ESCALATION" || result.route === "human") {
				return humanEscalation(state, "Tester requested human escalation.");
			}
			return retryWorker(
				state,
				"test",
				result.route ?? state.currentWorker,
				"Tester found an unmet criterion or regression risk",
			);

		case "security":
			if (result.verdict === "HUMAN_ESCALATION") {
				return humanEscalation(state, "Security triage requested human escalation.");
			}
			if (result.verdict === "LOW_RISK" && !result.securitySensitive && result.triggers.length === 0) {
				return nextAfterSecurity(state, "Security triage deems the change low-risk; no deep pass needed.");
			}
			return transitionTo(state, "security-deep", "Security triage flagged a security-sensitive or inconsistent change; running the deep adversarial pass.");

		case "security-deep":
			if (result.verdict === "SECURE") {
				return nextAfterSecurity(state, "Deep security pass passed; the final settled state is ready for the next gate.");
			}
			if (result.verdict === "HUMAN_ESCALATION" || result.route === "human") {
				return humanEscalation(state, "Security reviewer requested human escalation.");
			}
			return retryWorker(
				state,
				"security",
				"worker-complex",
				"Deep security review requested remediation before documentation",
			);

		case "documentation":
			if (result.verdict === "DOCUMENTED" || result.verdict === "NOT_NEEDED") {
				return transitionTo(state, "integrate", "Documentation complete; integrator is the final gate.");
			}
			return humanEscalation(state, "Documentation worker requested human escalation.");

		case "integrate":
			if (result.verdict === "INTEGRATED") {
				return transitionTo(state, "ready-to-merge", "Integration complete; work is ready for human merge.");
			}
			return humanEscalation(state, "Integrator requested human escalation; no automatic merge was performed.");

	}
}
