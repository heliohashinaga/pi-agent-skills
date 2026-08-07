import type {
	GateResult,
	GateStage,
	IntegrateResult,
	PlannedSliceResult,
} from "./contracts";
import {
	type DevloopSession,
	createSession,
	flushSession,
	ledgerEntryFor,
	loadSession,
	planFilePath,
	planFromResult,
	sessionPath,
	writePlanFile,
} from "./session";
import {
	dedupeSkills,
	feedbackFor,
	gateSpecs,
	planContextJson,
	selectAgent,
} from "./gates";
import { integratePrompt } from "./prompts";
import { createRunState, transition, type RunTransition } from "./routing";
import type { PipelineEvent } from "./pipeline";
import type { TaskDefinition } from "./task";
import { DevloopDelegationError } from "./errors";

export interface ControllerOutput {
	status: "ready-to-merge" | "human-escalation";
	reason: string;
}

export interface DelegationProposal {
	stage: GateStage;
	agent: string;
	/** Resolved child model, passed to the delegate and displayed before telemetry. */
	model?: string;
	prompt: string;
	skills?: string[];
}

export interface DelegationDeps {
	/**
	 * Execute one agent and resolve to the structured result (already validated
	 * against the gate's schema by the caller). Throw to escalate.
	 */
	delegate: (proposal: DelegationProposal) => Promise<unknown>;
}

export interface ControllerDeps extends DelegationDeps {
	task: TaskDefinition;
	/** Repository-relative task tracking file selected by CLI/config. */
	tasksPath?: string;
	/** Production re-reads tracking and Git state after integration. */
	verifyTaskTracking?: (taskId: string) => Promise<{ completed: boolean; clean: boolean }>;
	allowPublish?: boolean;
	/** Resolve the configured child model before a stage is dispatched. */
	resolveModel?: (agent: string) => string | undefined;
	/**
	 * Worktree/repo directory used to resolve `.pi/devloop-sessions/` for the
	 * persisted session ledger. Defaults to `process.cwd()` when omitted.
	 */
	cwd?: string;
	/**
	 * Optional visualization observer. Receives pure pipeline events describing
	 * gate dispatch and telemetry. Never used for routing; default no-op.
	 */
	onEvent?: (event: PipelineEvent) => void;
}

/**
 * Run a single task through the gate pipeline: planner → task-qa → code →
 * review → test → security → documentation → integrate (with retries/escalation
 * per the routing state machine). Owns the run loop, session ledger persistence,
 * code-stage timeout salvage, and integrate validation only — gate prompts,
 * the gate table, and the tester-tier rule now live in `lib/prompts.ts` and
 * `lib/gates.ts`.
 */
export async function runController(deps: ControllerDeps): Promise<ControllerOutput> {
	let state = createRunState();
	let feedback = "";
	let codeSalvageCount = 0;
	let plannerSkills: string[] = [];
	let planContext: string | undefined;
	const gateEvidence: GateResult[] = [];
	const agentsDispatched: string[] = [];
	const emit = deps.onEvent ?? (() => {});

	// Load or create the per-task session ledger so a crashed/timeout re-run
	// resumes with the validated history instead of re-deriving from scratch.
	let session: DevloopSession = loadSession(deps.task.id, deps.cwd) ?? createSession(deps.task.id, deps.cwd);
	flushSession(session, deps.cwd);

	// Emit the terminal event and persist the final status before returning;
	// used by every terminal return path.
	const endRun = (
		status: "ready-to-merge" | "human-escalation",
		reason: string,
	): ControllerOutput => {
		emit({ type: "run:end", unit: deps.task.id, status, reason });
		session.status = status;
		session.currentStage = status;
		flushSession(session, deps.cwd);
		return { status, reason };
	};

	while (state.stage !== "ready-to-merge" && state.stage !== "human-escalation") {
		const currentStage = state.stage as GateStage;
		if (!(currentStage in gateSpecs)) {
			return endRun("human-escalation", `Unhandled stage ${currentStage}.`);
		}

		const spec = gateSpecs[currentStage];
		const agent = selectAgent(spec, currentStage, state.currentWorker, session.plan?.testPlan);
		let value: unknown;
		try {
			const prompt =
				currentStage === "integrate"
					? integratePrompt(deps.task, deps.tasksPath ?? "tasks.md", gateEvidence, deps.allowPublish === true)
					: spec.prompt(
							deps.task,
							feedback,
							planContext,
							sessionPath(deps.task.id, deps.cwd),
							planContext ? planFilePath(deps.task.id, deps.cwd) : undefined,
					  );
			const model = deps.resolveModel?.(agent);
			const proposal: DelegationProposal = {
				stage: currentStage,
				agent,
				prompt,
				...(model ? { model } : {}),
			};

			// Skills routing: implementation always gets dedupe([...plannerSkills, 'gitmoji']),
			// even when plannerSkills is empty (gitmoji alone).
			// documentation gets docs + gitmoji.
			if (currentStage === "code") {
				proposal.skills = dedupeSkills([...plannerSkills, "gitmoji"]);
			} else if (currentStage === "documentation") {
				proposal.skills = ["gitmoji", "docs"];
			}

			emit({
				type: "stage:start",
				unit: deps.task.id,
				stage: currentStage,
				agent,
				...(proposal.model ? { model: proposal.model } : {}),
			});
			value = await deps.delegate(proposal);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			emit({
				type: "stage:failed",
				unit: deps.task.id,
				stage: currentStage,
				agent,
				error: message,
			});

			// Code-stage timeout salvage: retry ONCE before human escalation. A timed-out
			// worker leaves partial useful work in the worktree; a fresh budget finalizes it
			// instead of losing it. The salvage budget is capped at one per run: whichever
			// worker starts the code stage gets at most one retry — a worker-simple escalates
			// to worker-complex, and a worker-complex retries itself — before escalation.
			// Previously a worker-complex timeout was terminal (no worker-simple mediation),
			// so a complex slice that ran out of clock lost its partial work entirely.
			const isTimeout = error instanceof DevloopDelegationError && error.kind === "timed_out";
			if (currentStage === "code" && isTimeout && codeSalvageCount < 1) {
				codeSalvageCount += 1;
				if (agent === "worker-simple") {
					state.currentWorker = "worker-complex";
					feedback = `${agent} timed out; salvaging with worker-complex`;
				} else {
					// worker-complex timed out — retry it once with a fresh budget on the same
					// worktree so its partial work can be finalized.
					feedback = `${agent} timed out; retrying with a fresh budget to finalize partial work`;
				}
				continue;
			}

			return endRun("human-escalation", `${currentStage} delegate failed: ${message}`);
		}

		const result = value as GateResult;
		emit({
			type: "stage:done",
			unit: deps.task.id,
			stage: currentStage,
			agent,
			verdict: result.verdict,
			summary: result.summary,
			findings: (result as { findings?: import("./contracts").Finding[] }).findings,
			changedFiles: (result as { changedFiles?: string[] }).changedFiles,
		});
		agentsDispatched.push(agent);
		gateEvidence.push(result);
		feedback = feedbackFor(result);

		// Persist the gate result to the session ledger, and capture the planner's
		// scope once so downstream gates can read it from the file.
		session.currentStage = currentStage;
		session.ledger.push(ledgerEntryFor(result, agent));
		flushSession(session, deps.cwd);

		// Persist the planner result and derive planContext for downstream prompts.
		if (currentStage === "planner") {
			const planned = result as PlannedSliceResult;
			plannerSkills = Array.isArray(planned.skills) ? dedupeSkills(planned.skills) : [];
			planContext = planContextJson(planned);
			session.plan = planFromResult(planned);
			// Physically write the plan JSON so read-only gates (e.g. task-qa) load
			// it from disk as the authoritative scope and acceptance spec.
			writePlanFile(deps.task.id, session.plan, deps.cwd);
			flushSession(session, deps.cwd);
		}

		if (currentStage === "integrate") {
			const integrateResult = result as IntegrateResult;
			if (integrateResult.merged !== false) {
				return endRun(
					"human-escalation",
					"Integrator reported an automatic merge, which devloop forbids.",
				);
			}
			if (integrateResult.prOpened && deps.allowPublish !== true) {
				return endRun(
					"human-escalation",
					"Integrator opened a PR without the explicit --pr authorization.",
				);
			}
			// Validate task tracking: tasksMarkedDone MUST be exactly [task.id].
			if (
				!integrateResult.tasksMarkedDone ||
				!Array.isArray(integrateResult.tasksMarkedDone) ||
				integrateResult.tasksMarkedDone.length !== 1 ||
				integrateResult.tasksMarkedDone[0] !== deps.task.id
			) {
				return endRun(
					"human-escalation",
					`Integrator tasksMarkedDone must be exactly ["${deps.task.id}"], got: ${JSON.stringify(integrateResult.tasksMarkedDone)}.`,
				);
			}
			if (deps.verifyTaskTracking) {
				const tracking = await deps.verifyTaskTracking(deps.task.id);
				if (!tracking.completed || !tracking.clean) {
					return endRun(
						"human-escalation",
						`Task tracking verification failed for ${deps.task.id}: completed=${tracking.completed}, clean=${tracking.clean}.`,
					);
				}
			}
		}

		const next: RunTransition = transition(state, result);
		state = next.state;
	}

	const routeToTerminal = state.stage;
	return endRun(
		routeToTerminal === "ready-to-merge" ? "ready-to-merge" : "human-escalation",
		routeToTerminal === "ready-to-merge"
			? `All gates passed (${agentsDispatched.join(" → ")}).`
			: `Delegation or gate routed to human: ${feedback || routeToTerminal}.`,
	);
}
