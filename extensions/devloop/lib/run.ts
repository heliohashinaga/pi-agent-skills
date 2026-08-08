import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	WidgetContent,
} from "@earendil-works/pi-coding-agent";
import {
	type SubagentDelegationRequest as SubagentDelegationV2Request,
	type SubagentDelegationResponse as SubagentDelegationV2Response,
} from "pi-subagents/delegation";
import { resolveSubagentLaunchContract } from "pi-subagents/preflight";

import { parseArgs, type Selection } from "./cli";
import { gateResultSchemas, type GateStage } from "./contracts";
import {
	parseDevloopConfig,
	readConfigText,
	resolveStageTimeoutMs,
	resolveTasksPath,
	withTerminalResponseGrace,
	type DevloopConfigSource,
} from "./config";
import {
	getActiveDevloopRun,
	getActiveDevloopRunId,
	registerActiveDevloopRun,
} from "./cancellation";
import { runController, type DelegationProposal } from "./controller";
import { delegate } from "./delegate";
import {
	createPipelineObserver as createRuntimeObserver,
	type PipelineObserver,
} from "./observer";
import type { PipelineEvent } from "./pipeline";
import { buildExecutionPlan } from "./scheduler";
import {
	parseTaskDocument,
	selectPhase,
	selectRange,
	type TaskDefinition,
} from "./task";
import { createWorktree, preflightGitWorkspace, removeDevloopWorktree } from "./worktree";
import type { CommandRunner } from "./shell";
import { appendStackEntry, chainTip, ensureStack, stackSummary } from "./stack";
import { createPullRequest } from "./pr";
import { consolidate, writeRetro } from "./retro";
import { runRetroAnalysis } from "./retro-agent";

const PIPELINE_WIDGET_KEY = "devloop-pipeline";
type JsonRecord = Record<string, unknown>;

/** Gate result schemas keyed by stage, used to validate each delegation. */
const stageSchemas: Record<GateStage, JsonRecord> = {
	planner: gateResultSchemas.planner,
	"task-qa": gateResultSchemas.taskQa,
	code: gateResultSchemas.code,
	review: gateResultSchemas.review,
	test: gateResultSchemas.test,
	security: gateResultSchemas.security,
	"security-deep": gateResultSchemas["security-deep"],
	documentation: gateResultSchemas.documentation,
	integrate: gateResultSchemas.integrate,
};

/** Every agent the pipeline may dispatch; preflight resolves their models. */
const requiredAgents = [
	"feature-planner",
	"task-qa",
	"worker-simple",
	"worker-complex",
	"reviewer-complex",
	"reviewer-simple",
	"tester-complex",
	"tester-simple",
	"security-triage",
	"security-reviewer",
	"integrator",
];

/** Human-readable run label: task id, phase-N, or A-B. */
export function selectionLabel(selection: Selection): string {
	if (selection.mode === "task") return selection.taskId;
	if (selection.mode === "phase") return `phase-${selection.phase}`;
	return `${selection.from}-${selection.to}`;
}

/** Resolve the tasks a selection covers, validating a single task is incomplete. */
function selectedTasks(
	document: ReturnType<typeof parseTaskDocument>,
	selection: Selection,
): TaskDefinition[] {
	if (selection.mode === "task") return [selectIncompleteTaskFromDocument(document, selection.taskId)];
	if (selection.mode === "phase") return selectPhase(document, selection.phase);
	return selectRange(document, selection.from, selection.to);
}

function selectIncompleteTaskFromDocument(
	document: ReturnType<typeof parseTaskDocument>,
	taskId: string,
): TaskDefinition {
	const task = document.tasks.find((candidate) => candidate.id === taskId);
	if (!task) throw new Error(`Task ${taskId} does not exist in tasks.md.`);
	if (task.completed) throw new Error(`Task ${taskId} is already completed.`);
	return task;
}

/** Adapt the pi exec surface to the extension's `CommandRunner` seam. */
export function toRunner(pi: ExtensionAPI): CommandRunner {
	return {
		exec: async (command, args, options) => {
			const result = await pi.exec(command, args, options);
			return { code: result.code, stdout: result.stdout, stderr: result.stderr };
		},
	};
}

/**
 * Preflight every required agent in parallel and resolve its configured model.
 * Runs the 11 `resolveSubagentLaunchContract` checks concurrently (they are
 * independent reads); the first failure in `requiredAgents` order wins so the
 * error stays deterministic. Returns agent → model.
 */
async function preflightAgents(
	ctx: ExtensionCommandContext,
	cwd: string,
): Promise<Map<string, string>> {
	const results = await Promise.all(
		requiredAgents.map((agent) =>
			resolveSubagentLaunchContract({
				agent,
				cwd,
				context: "fresh",
				agentScope: "both",
				availableModels: ctx.modelRegistry.getAvailable(),
				...(ctx.model ? { parentModel: ctx.model } : {}),
				artifacts: false,
			}),
		),
	);

	const models = new Map<string, string>();
	for (let i = 0; i < requiredAgents.length; i += 1) {
		const agent = requiredAgents[i]!;
		const result = results[i]!;
		if (!result.ok) throw new Error(`Agent ${agent} is unavailable (${result.code}): ${result.message}`);
		if (result.contract?.model) models.set(agent, result.contract.model);
	}
	return models;
}

/** Build a delegation v2 request for a gate proposal. */
function buildRequest(
	proposal: DelegationProposal,
	cwd: string,
	ownerRunId: string,
	timeoutMs: number,
): SubagentDelegationV2Request {
	return {
		requestId: randomUUID(),
		ownerRunId,
		nodeId: `${proposal.stage}:${randomUUID()}`,
		agent: proposal.agent,
		task: proposal.prompt,
		context: "fresh",
		cwd,
		...(proposal.model ? { model: proposal.model } : {}),
		...(proposal.skills ? { skill: proposal.skills } : {}),
		timeoutMs,
		turnBudget: { maxTurns: 32, graceTurns: 0 },
		artifacts: false,
		result: { kind: "structured", schema: stageSchemas[proposal.stage] },
	};
}

/** Adapt the delegation protocol into the controller's `delegate` callback. */
function toDelegator(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	cwd: string,
	ownerRunId: string,
	onEvent?: (event: PipelineEvent) => void,
	unit?: string,
	config?: DevloopConfigSource,
	signal?: AbortSignal,
) {
	return async (proposal: DelegationProposal): Promise<unknown> => {
		const childTimeoutMs = resolveStageTimeoutMs(proposal.stage, config);
		const response: SubagentDelegationV2Response = await delegate(pi, ctx, {
			request: buildRequest(proposal, cwd, ownerRunId, childTimeoutMs),
			// Let the child publish its terminal timed_out/cancelled response before
			// the outer transport watchdog cancels the event subscription.
			timeoutMs: withTerminalResponseGrace(childTimeoutMs),
			statusKey: `devloop:${proposal.stage}`,
			signal,
			onUpdate: (update) =>
				onEvent?.({
					type: "live:update",
					unit: unit ?? "run",
					stage: proposal.stage,
					agent: proposal.agent,
					...(update.model ? { model: update.model } : {}),
					...(update.tool !== undefined ? { tool: update.tool } : {}),
					...(update.toolCount !== undefined ? { toolCount: update.toolCount } : {}),
					...(update.tokens !== undefined ? { tokens: update.tokens } : {}),
					...(update.durationMs !== undefined ? { durationMs: update.durationMs } : {}),
				}),
		});
		if (response.usage) {
			onEvent?.({
				type: "live:update",
				unit: unit ?? "run",
				stage: proposal.stage,
				agent: proposal.agent,
				...(response.model ? { model: response.model } : {}),
				toolCount: response.usage.toolCalls,
				tokens: response.usage.input + response.usage.output,
				durationMs: response.usage.durationMs,
			});
		}
		if (response.status !== "completed") throw new Error(`${proposal.agent} failed (${response.status}): ${response.error ?? "no error"}`);
		if (response.result?.kind !== "structured") throw new Error(`${proposal.agent} did not return a structured result.`);
		return response.result.value;
	};
}

/** Outcome of a run: enough for the command layer to notify the user. */
export interface RunOutcome {
	status: "ready-to-merge" | "human-escalation";
	/** selectionLabel (task id, phase-N, or A-B). */
	label: string;
	branch: string;
	/** Tasks that passed all gates. */
	completed: string[];
	/** First task that did not pass (batch); undefined for single-task escalation or a blocked batch. */
	failedTask?: string;
	/** Escalation reason (human-escalation only). */
	reason?: string;
	/** finalizeSuccess note (ready-to-merge only): PR + worktree + chain summary. */
	finalizeNote?: string;
}

/**
 * Orchestrate a single devloop run end to end: preflight → config → tasks →
 * plan → worktree → observer → gate pipeline (task or batch, unified) → retro
 * capture → optional recommendations. Throws on failure; the caller owns the
 * lease + interrupt + error boundary.
 *
 * Notifies the user for run progression (started, dry-run, ready-to-merge,
 * escalation, retro/recommend warnings); the caller notifies for the lifecycle
 * (already-in-progress, cancelled, failed).
 */
export async function runDevloop(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string,
	abortController: AbortController,
): Promise<RunOutcome> {
	const options = parseArgs(args);
	const label = selectionLabel(options.selection);
	const isSingle = options.selection.mode === "task";

	const runner = toRunner(pi);
	const workspace = await preflightGitWorkspace(runner, ctx.cwd, abortController.signal);
	const configText = readConfigText(workspace.repoRoot);
	const config = parseDevloopConfig(configText.text);
	const tasksPath = resolveTasksPath(workspace.repoRoot, options.tasksPath, config, (candidate) =>
		existsSync(path.join(workspace.repoRoot, candidate)),
	);
	const tasksSource = readFileSync(tasksPath, "utf8");
	const document = parseTaskDocument(tasksSource);
	const selected = selectedTasks(document, options.selection);
	const plan = buildExecutionPlan(document, selected);
	const agentModels = await preflightAgents(ctx, workspace.repoRoot);

	// Bail early if cancelled before preflight completes.
	if (abortController.signal.aborted) {
		ctx.ui.notify("Devloop cancelled before starting.", "warning");
		return { status: "human-escalation", label, branch: "", completed: [], reason: "cancelled before starting" };
	}

	if (options.dryRun) {
		const blocker = plan.blockedBy.length > 0 ? ` Blocked by: ${plan.blockedBy.join(", ")}.` : "";
		ctx.ui.notify(
			`Devloop dry-run ${label}: pending ${plan.pendingIds.join(", ") || "none"}; completed ${plan.completed.join(", ") || "none"}.${blocker}`,
			plan.blockedBy.length ? "warning" : "info",
		);
		return { status: "human-escalation", label, branch: "", completed: [], reason: "dry-run" };
	}

	const runId = getActiveDevloopRunId();
	if (!runId) throw new Error("Devloop lease identity was lost before worktree creation.");
	const relativeTasksPath = path.relative(workspace.repoRoot, tasksPath);
	if (relativeTasksPath.startsWith("..")) throw new Error("Tasks path must be inside the repository.");

	// Resolve the chain so this run branches off the tip of the previous run
	// (or the stack base when starting a fresh chain), forming stacked PRs.
	const stackBase = options.stackBase ?? config?.stack?.base ?? "main";
	const stackName = options.stack ?? config?.stack?.name ?? label;
	await ensureStack(workspace.repoRoot, stackName, stackBase);
	const chainTipBranch = await chainTip(workspace.repoRoot, stackBase);

	const handle = await createWorktree(
		runner,
		{
			repoRoot: workspace.repoRoot,
			taskId: selected[0]!.id,
			runId,
			label,
			startCommit: chainTipBranch,
		},
		abortController.signal,
	);
	const worktreeTasksPath = path.join(handle.path, relativeTasksPath);
	const verifyTaskTracking = async (taskId: string): Promise<{ completed: boolean; clean: boolean }> => {
		let completed = false;
		try {
			completed = parseTaskDocument(readFileSync(worktreeTasksPath, "utf8"))
				.tasks.some((task) => task.id === taskId && task.completed === true);
		} catch {
			completed = false;
		}
		const status = await runner.exec("git", ["status", "--porcelain"], {
			cwd: handle.path,
			signal: abortController.signal,
		});
		return { completed, clean: status.code === 0 && status.stdout.trim().length === 0 };
	};
	await registerActiveDevloopRun({
		runId,
		label,
		worktreePath: handle.path,
		repoRoot: workspace.repoRoot,
		startedAt: Date.now(),
	});
	ctx.ui.notify(`Devloop started ${label} on ${handle.branch}. Press Esc to cancel.`, "info");

	const observer: PipelineObserver = createRuntimeObserver({
		label,
		tuiEnabled: ctx.mode === "tui" && ctx.hasUI,
		setWidget: (content) => ctx.ui.setWidget(PIPELINE_WIDGET_KEY, content as WidgetContent),
		clearWidget: () => ctx.ui.setWidget(PIPELINE_WIDGET_KEY, undefined),
		appendEntry: (customType, data) => pi.appendEntry(customType, data),
	});
	const pipeline = observer;
	const removeOnSuccess = config?.keepWorktreeOnSuccess !== true;
	const ownerRunId = `devloop/${label}-${runId}`;

	/** Consolidate + persist run-level facts (root, not worktree) at close. */
	const captureRetro = async (): Promise<void> => {
		const run = await getActiveDevloopRun();
		let gitSha: string | undefined;
		try {
			const res = await runner.exec("git", ["rev-parse", "HEAD"], {
				cwd: handle.path,
				signal: abortController.signal,
			});
			if (res.code === 0 && res.stdout.trim()) gitSha = res.stdout.trim();
		} catch {
			// optional metadata; never fail the retro capture
		}
		const metrics = consolidate(observer.snapshot(), {
			runId,
			label,
			taskIds: selected.map((task) => task.id),
			branch: handle.branch,
			stackName,
			...(gitSha ? { gitSha } : {}),
			startedAt: run ? new Date(run.startedAt).toISOString() : new Date().toISOString(),
			finishedAt: new Date().toISOString(),
		});
		try {
			writeRetro(metrics, workspace.repoRoot);
		} catch (captureError) {
			// Retro capture must never fail the run itself.
			ctx.ui.notify(`Devloop retro capture failed: ${captureError instanceof Error ? captureError.message : String(captureError)}`, "warning");
		}
	};

	/**
	 * Opt-in post-run recommendation generation (config `retro.recommend`).
	 * Runs on every terminal outcome — ready-to-merge AND human-escalation —
	 * since escalation is where the highest-value learning lives. Never fails
	 * the run: errors only surface as a warning.
	 */
	const maybeRecommend = async (): Promise<void> => {
		if (!config?.retro?.recommend) return;
		try {
			await runRetroAnalysis(pi, ctx, workspace.repoRoot, runId);
		} catch (recError) {
			ctx.ui.notify(`Devloop recommendation generation failed: ${recError instanceof Error ? recError.message : String(recError)}`, "warning");
		}
	};

	/** Register the finished run in the chain, optionally open its PR, and remove its worktree. */
	const finalizeSuccess = async (task: string): Promise<string> => {
		// prBase is the current chain tip before this run is appended (prev. branch or base).
		const prBase = await chainTip(workspace.repoRoot, stackBase);

		let prUrl: string | undefined;
		let prNote = "";
		if (options.publish) {
			try {
				prUrl = await createPullRequest(runner, {
					repoRoot: workspace.repoRoot,
					branch: handle.branch,
					prBase,
					title: `${task}: integrate ${stackName}`,
				});
				prNote = ` PR ${prUrl}.`;
			} catch (error) {
				prNote = ` PR failed (${error instanceof Error ? error.message : String(error)}).`;
			}
		}

		await appendStackEntry(workspace.repoRoot, stackName, stackBase, {
			task,
			branch: handle.branch,
			...(prUrl ? { prUrl } : {}),
		});

		let worktreeNote = "";
		if (removeOnSuccess) {
			try {
				await removeDevloopWorktree(runner, workspace.repoRoot, handle.branch);
				worktreeNote = " Worktree removed.";
			} catch (error) {
				worktreeNote = ` Worktree kept (${error instanceof Error ? error.message : String(error)}).`;
			}
		}

		const chain = await stackSummary(workspace.repoRoot);
		return `${prNote}${worktreeNote} Chain:\n${chain}`;
	};

	try {
		// Batch (phase/range): refuse to run when incomplete prerequisites precede
		// the selection. A single task is allowed to run regardless (preserves the
		// original single-task path, which never consulted plan.blockedBy).
		if (!isSingle && plan.blockedBy.length > 0) {
			const reason = `Batch is blocked by incomplete prerequisites: ${plan.blockedBy.join(", ")}.`;
			await captureRetro();
			pipeline.clear();
			await maybeRecommend();
			ctx.ui.notify(`Devloop ${label} stopped at preflight: ${reason}`, "warning");
			return { status: "human-escalation", label, branch: handle.branch, completed: [], reason };
		}

		// Unified sequential loop: single task = [the task]; batch = plan.tasks.
		const tasksToRun = isSingle ? [selected[0]!] : plan.tasks;
		const completed: string[] = [];
		let failedTask: string | undefined;
		let escalationReason = "";

		for (const task of tasksToRun) {
			const output = await runController({
				task,
				tasksPath: relativeTasksPath,
				cwd: handle.path,
				verifyTaskTracking,
				delegate: toDelegator(pi, ctx, handle.path, ownerRunId, pipeline.onEvent, task.id, config, abortController.signal),
				allowPublish: options.publish,
				resolveModel: (agent) => agentModels.get(agent),
				onEvent: pipeline.onEvent,
			});
			if (output.status !== "ready-to-merge") {
				failedTask = task.id;
				escalationReason = output.reason;
				break;
			}
			completed.push(task.id);
		}

		await captureRetro();
		pipeline.clear();

		if (failedTask === undefined) {
			// All tasks passed (single or batch). `label` is the task id for a single
			// task and the selection label for a batch — both are the correct stack id.
			const note = await finalizeSuccess(label);
			await maybeRecommend();
			const completedText = isSingle ? "" : ` (${completed.join(", ")})`;
			ctx.ui.notify(`Devloop ${label} is READY_TO_MERGE${completedText}. Review ${handle.branch}.${note}`, "info");
			return { status: "ready-to-merge", label, branch: handle.branch, completed, finalizeNote: note };
		}

		await maybeRecommend();
		if (isSingle) {
			ctx.ui.notify(`Devloop ${label} needs human attention: ${escalationReason}`, "warning");
		} else {
			ctx.ui.notify(`Devloop ${label} stopped at ${failedTask}: ${escalationReason}`, "warning");
		}
		return { status: "human-escalation", label, branch: handle.branch, completed, failedTask, reason: escalationReason };
	} finally {
		pipeline.clear();
	}
}
