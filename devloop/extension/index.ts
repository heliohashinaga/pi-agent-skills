import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	CustomEditor,
	type EditorComponentFactory,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type WidgetContent,
} from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import {
	type SubagentDelegationRequest as SubagentDelegationV2Request,
	type SubagentDelegationResponse as SubagentDelegationV2Response,
} from "pi-subagents/delegation";
import { resolveSubagentLaunchContract } from "pi-subagents/preflight";

import { parseArgs, type Selection } from "./lib/cli";
import { gateResultSchemas, type GateStage } from "./lib/contracts";
import {
	parseDevloopConfig,
	readConfigText,
	resolveStageTimeoutMs,
	resolveTasksPath,
	withTerminalResponseGrace,
	type DevloopConfigSource,
} from "./lib/config";
import { runBatchController } from "./lib/batch-controller";
import {
	beginDevloopRun,
	cancelActiveDevloopRun,
	clearActiveDevloopRun,
	getActiveDevloopRun,
	getActiveDevloopRunId,
	hasActiveDevloopRun,
	registerActiveDevloopRun,
} from "./lib/cancellation";
import { renderGateCard, renderRetroCard, RETRO_ENTRY_TYPE, type GateCardData, type RetroCardData } from "./lib/cards";
import { runController, type DelegationProposal } from "./lib/controller";
import { delegate } from "./lib/delegate";
import {
	createPipelineObserver as createRuntimeObserver,
	GATE_ENTRY_TYPE,
	type PipelineObserver,
} from "./lib/observer";
import type { PipelineEvent } from "./lib/pipeline";
import { buildExecutionPlan } from "./lib/scheduler";
import {
	parseTaskDocument,
	selectIncompleteTask,
	selectPhase,
	selectRange,
	type TaskDefinition,
} from "./lib/task";
import { createWorktree, listDevloopWorktrees, preflightGitWorkspace, removeDevloopWorktree } from "./lib/worktree";
import { appendStackEntry, chainTip, ensureStack, stackSummary } from "./lib/stack";
import { createPullRequest } from "./lib/pr";
import type { CommandRunner } from "./lib/shell";
import { consolidate, writeRetro } from "./lib/retro";
import { listRetros, readRetro, removeRetros } from "./lib/retro";
import { runRetroAnalysis } from "./lib/retro-agent";

const MAX_SMOKE_AGENTS_PER_RUN = 8;
const PIPELINE_WIDGET_KEY = "devloop-pipeline";
type JsonRecord = Record<string, unknown>;

/**
 * Keeps the normal pi editor behavior but gives Esc precedence while devloop
 * owns a long-running command. The built-in app.interrupt handler otherwise
 * only aborts active agent streams, not extension command handlers.
 */
function cancelFromEscape(): boolean {
	const result = cancelActiveDevloopRun();
	return result?.status === "cancelled";
}

class DevloopInterruptEditor extends CustomEditor {
	override handleInput(data: string): void {
		if (!this.isShowingAutocomplete() && matchesKey(data, "escape") && cancelFromEscape()) return;
		super.handleInput(data);
	}
}

function attachDevloopInterrupt(editor: CustomEditor): void {
	const previousOnEscape = editor.onEscape;
	editor.onEscape = () => {
		if (!cancelFromEscape()) previousOnEscape?.();
	};
}

/**
 * Install the Esc handler at run start, after every session-start extension
 * (notably stickybar) has finished choosing its editor. Installing only from
 * devloop's session_start is order-dependent: a later editor extension can
 * replace the factory and silently remove cancellation.
 */
function installRunInterrupt(ctx: ExtensionCommandContext): () => void {
	if (ctx.mode !== "tui" || !ctx.hasUI) return () => {};

	const previousFactory = ctx.ui.getEditorComponent();
	const runFactory: EditorComponentFactory = (tui, theme, keybindings) => {
		if (!previousFactory) return new DevloopInterruptEditor(tui, theme, keybindings);
		const editor = previousFactory(tui, theme, keybindings);
		attachDevloopInterrupt(editor);
		return editor;
	};
	ctx.ui.setEditorComponent(runFactory);

	return () => {
		// Do not clobber an editor installed by another extension during the run.
		if (ctx.ui.getEditorComponent() === runFactory) ctx.ui.setEditorComponent(previousFactory);
	};
}

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

function toRunner(pi: ExtensionAPI): CommandRunner {
	return {
		exec: async (command, args, options) => {
			const result = await pi.exec(command, args, options);
			return { code: result.code, stdout: result.stdout, stderr: result.stderr };
		},
	};
}

async function preflightAgents(ctx: ExtensionCommandContext, cwd: string): Promise<Map<string, string>> {
	const models = new Map<string, string>();
	for (const agent of requiredAgents) {
		const result = await resolveSubagentLaunchContract({
			agent,
			cwd,
			context: "fresh",
			agentScope: "both",
			availableModels: ctx.modelRegistry.getAvailable(),
			...(ctx.model ? { parentModel: ctx.model } : {}),
			artifacts: false,
		});
		if (!result.ok) throw new Error(`Agent ${agent} is unavailable (${result.code}): ${result.message}`);
		if (result.contract?.model) models.set(agent, result.contract.model);
	}
	return models;
}

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

/**
 * TUI-only live pipeline widget. Maintains a `PipelineSnapshot` from observer
 * events and re-renders the `devloop-pipeline` widget on every change. Falls
 * back to a no-op in non-TUI modes so `-p`/RPC runs are unaffected. Also
 * appends a durable per-gate history card (all modes) on gate completion.
 */
function selectionLabel(selection: Selection): string {
	if (selection.mode === "task") return selection.taskId;
	if (selection.mode === "phase") return `phase-${selection.phase}`;
	return `${selection.from}-${selection.to}`;
}

function selectedTasks(document: ReturnType<typeof parseTaskDocument>, selection: Selection): TaskDefinition[] {
	if (selection.mode === "task") return [selectIncompleteTaskFromDocument(document, selection.taskId)];
	if (selection.mode === "phase") return selectPhase(document, selection.phase);
	return selectRange(document, selection.from, selection.to);
}

function selectIncompleteTaskFromDocument(document: ReturnType<typeof parseTaskDocument>, taskId: string): TaskDefinition {
	const task = document.tasks.find((candidate) => candidate.id === taskId);
	if (!task) throw new Error(`Task ${taskId} does not exist in tasks.md.`);
	if (task.completed) throw new Error(`Task ${taskId} is already completed.`);
	return task;
}

const smokeResultSchema = {
	type: "object",
	additionalProperties: false,
	required: ["verdict", "summary"],
	properties: { verdict: { const: "SMOKE_PASS" }, summary: { type: "string", minLength: 1 } },
};
function buildSmokeRequest(agent: string, cwd: string, ownerRunId: string): SubagentDelegationV2Request {
	return {
		requestId: randomUUID(), ownerRunId, nodeId: `smoke:${randomUUID()}`, agent,
		task: "Read-only devloop smoke test. Do not modify files or run commands. Return SMOKE_PASS with a concise summary; read-only inspection is allowed only if needed.",
		context: "fresh", cwd, timeoutMs: 120_000,
		turnBudget: { maxTurns: 8, graceTurns: 0 },
		toolBudget: { hard: 8, block: ["bash", "edit", "write", "intercom"] },
		artifacts: false, result: { kind: "structured", schema: smokeResultSchema },
	};
}

export default function devloopExtension(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) return;

		const previousFactory = ctx.ui.getEditorComponent();
		if (!previousFactory) {
			ctx.ui.setEditorComponent((tui, theme, keybindings) =>
				new DevloopInterruptEditor(tui, theme, keybindings),
			);
			return;
		}

		// Preserve an existing editor extension and attach devloop cancellation to
		// its standard CustomEditor Escape callback instead of disabling Esc.
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor = previousFactory(tui, theme, keybindings);
			attachDevloopInterrupt(editor);
			return editor;
		});
	});

	pi.registerEntryRenderer<GateCardData>(GATE_ENTRY_TYPE, (entry, { expanded }, theme) =>
		renderGateCard(entry.data ?? { unit: "", stage: "devloop", agent: "" }, expanded, theme),
	);

	pi.registerEntryRenderer<RetroCardData>(RETRO_ENTRY_TYPE, (entry, { expanded }, theme) =>
		renderRetroCard(
			entry.data ?? {
				runId: "",
				label: "devloop",
				retries: 0,
				escalations: 0,
				stageCount: 0,
			},
			expanded,
			theme,
		),
	);

	pi.registerCommand("devloop-stop", {
		description: "Cancel the active devloop run (aborts delegation)",
		handler: async (_args, ctx) => {
			const result = cancelActiveDevloopRun();
			if (result) {
				await result.completion;
				const level = result.status === "cancelled" ? "warning" : result.status === "stale-cleaned" ? "info" : "warning";
				ctx.ui.notify(`Devloop ${result.status}: ${result.summary}`, level);
				return;
			}
			ctx.ui.notify("No devloop run is active.", "info");
		},
	});

	pi.registerCommand("devloop", {
		description: "Run a task, phase, or range through the automated devloop (usage: /devloop <TASK|phase-N|A-B>)",
		handler: async (args, ctx) => {
			// Reject if another devloop is already running.
			if (hasActiveDevloopRun()) {
				ctx.ui.notify("A devloop run is already in progress. Use /devloop-stop to cancel it first.", "warning");
				return;
			}

			const abortController = await beginDevloopRun();
			const restoreInterrupt = installRunInterrupt(ctx);

			let observer: PipelineObserver | undefined;
			try {
				const options = parseArgs(args);
				const runner = toRunner(pi);
				const workspace = await preflightGitWorkspace(runner, ctx.cwd, abortController.signal);
				const configText = readConfigText(workspace.repoRoot);
				const config = parseDevloopConfig(configText.text);
				const tasksPath = resolveTasksPath(workspace.repoRoot, options.tasksPath, config, (candidate) => existsSync(path.join(workspace.repoRoot, candidate)));
				const tasksSource = readFileSync(tasksPath, "utf8");
				const document = parseTaskDocument(tasksSource);
				const selected = selectedTasks(document, options.selection);
				const plan = buildExecutionPlan(document, selected);
				const agentModels = await preflightAgents(ctx, workspace.repoRoot);

				// Bail early if cancelled before preflight completes.
				if (abortController.signal.aborted) {
					ctx.ui.notify("Devloop cancelled before starting.", "warning");
					return;
				}

				if (options.dryRun) {
					const blocker = plan.blockedBy.length > 0 ? ` Blocked by: ${plan.blockedBy.join(", ")}.` : "";
					ctx.ui.notify(`Devloop dry-run ${selectionLabel(options.selection)}: pending ${plan.pendingIds.join(", ") || "none"}; completed ${plan.completed.join(", ") || "none"}.${blocker}`, plan.blockedBy.length ? "warning" : "info");
					return;
				}

				const runId = getActiveDevloopRunId();
				if (!runId) throw new Error("Devloop lease identity was lost before worktree creation.");
				const relativeTasksPath = path.relative(workspace.repoRoot, tasksPath);
				if (relativeTasksPath.startsWith("..")) throw new Error("Tasks path must be inside the repository.");

				// Resolve the chain so this run branches off the tip of the previous
				// run (or the stack base when starting a fresh chain), forming stacked PRs.
				const stackBase = options.stackBase ?? config?.stack?.base ?? "main";
				const stackName = options.stack ?? config?.stack?.name ?? selectionLabel(options.selection);
				await ensureStack(workspace.repoRoot, stackName, stackBase);
				const chainTipBranch = await chainTip(workspace.repoRoot, stackBase);

				const handle = await createWorktree(
					runner,
					{
						repoRoot: workspace.repoRoot,
						taskId: selected[0]!.id,
						runId,
						label: selectionLabel(options.selection),
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
					label: selectionLabel(options.selection),
					worktreePath: handle.path,
					repoRoot: workspace.repoRoot,
					startedAt: Date.now(),
				});
				ctx.ui.notify(`Devloop started ${selectionLabel(options.selection)} on ${handle.branch}. Press Esc to cancel.`, "info");
				observer = createRuntimeObserver({
					label: selectionLabel(options.selection),
					tuiEnabled: ctx.mode === "tui" && ctx.hasUI,
					setWidget: (content) => ctx.ui.setWidget(PIPELINE_WIDGET_KEY, content as WidgetContent),
					clearWidget: () => ctx.ui.setWidget(PIPELINE_WIDGET_KEY, undefined),
					appendEntry: (customType, data) => pi.appendEntry(customType, data),
				});
				const pipeline = observer;
				const removeOnSuccess = config?.keepWorktreeOnSuccess !== true;

				/** Consolidate + persist run-level facts (root, not worktree) at close. */
				const captureRetro = async (): Promise<void> => {
					if (!observer) return;
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
						label: selectionLabel(options.selection),
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

				if (options.selection.mode === "task") {
					const task = selected[0]!;
					const output = await runController({
						task,
						tasksPath: relativeTasksPath,
						cwd: handle.path,
						verifyTaskTracking,
						delegate: toDelegator(pi, ctx, handle.path, `devloop/${selectionLabel(options.selection)}-${runId}`, pipeline.onEvent, task.id, config, abortController.signal),
						allowPublish: options.publish,
						resolveModel: (agent) => agentModels.get(agent),
						onEvent: pipeline.onEvent,
					});
					await captureRetro();
					pipeline.clear();
					if (output.status === "ready-to-merge") {
						const note = await finalizeSuccess(task.id);
						await maybeRecommend();
						ctx.ui.notify(`Devloop ${task.id} is READY_TO_MERGE. Review ${handle.branch}.${note}`, "info");
						return;
					}
					await maybeRecommend();
					ctx.ui.notify(`Devloop ${task.id} needs human attention: ${output.reason}`, "warning");
					return;
				}

				const batch = await runBatchController({
					plan,
					runTask: (task) => runController({
						task,
						tasksPath: relativeTasksPath,
						cwd: handle.path,
						verifyTaskTracking,
						delegate: toDelegator(pi, ctx, handle.path, `devloop/${selectionLabel(options.selection)}-${runId}`, pipeline.onEvent, task.id, config, abortController.signal),
						allowPublish: options.publish,
						resolveModel: (agent) => agentModels.get(agent),
						onEvent: pipeline.onEvent,
					}),
				});
				await captureRetro();
				pipeline.clear();
				if (batch.status === "ready-to-merge") {
					const note = await finalizeSuccess(selectionLabel(options.selection));
					await maybeRecommend();
					ctx.ui.notify(`Devloop ${selectionLabel(options.selection)} is READY_TO_MERGE (${batch.completed.join(", ")}). Review ${handle.branch}.${note}`, "info");
					return;
				}
				await maybeRecommend();
				ctx.ui.notify(`Devloop ${selectionLabel(options.selection)} stopped at ${batch.failedTask ?? "preflight"}: ${batch.reason}`, "warning");
			} catch (error) {
				observer?.clear();
				const message = error instanceof Error ? error.message : String(error);
				if (abortController.signal.aborted) {
					ctx.ui.notify(`Devloop cancelled: ${message}`, "warning");
				} else {
					ctx.ui.notify(`Devloop failed: ${message}`, "error");
				}
			} finally {
				restoreInterrupt();
				await clearActiveDevloopRun(abortController);
			}
		},
	});


	pi.registerCommand("devloop-cleanup", {
		description: "List or remove devloop worktrees / retrospectives (usage: /devloop-cleanup [list | remove <branch> | --retros [keep]])",
		handler: async (args, ctx) => {
			const runner = toRunner(pi);
			const tokens = args.trim().split(/\s+/).filter(Boolean);

			if (tokens[0] === "--retros") {
				try {
					const workspace = await preflightGitWorkspace(runner, ctx.cwd);
					const keep =
						tokens[1] !== undefined
							? (() => {
									if (!/^\d+$/.test(tokens[1]!)) throw new Error(`Invalid keep count: '${tokens[1]}'`);
									return Number(tokens[1]);
								})()
							: 0;
					const removed = removeRetros(workspace.repoRoot, keep);
					ctx.ui.notify(`Devloop cleanup removed ${removed} retrospective(s).${keep > 0 ? ` Keeping the ${keep} most recent.` : ""}`, "info");
				} catch (error) {
					ctx.ui.notify(
						`Devloop cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				}
				return;
			}

			if (tokens.length === 0 || tokens[0] === "list") {
				try {
					const workspace = await preflightGitWorkspace(runner, ctx.cwd);
					const entries = await listDevloopWorktrees(runner, workspace.repoRoot);
					if (entries.length === 0) {
						ctx.ui.notify("No devloop worktrees found.", "info");
						return;
					}
					const lines = entries.map(
						(e) => `${e.branch} ${e.dirty ? "(dirty)" : "(clean)"} → ${e.path}`,
					);
					ctx.ui.notify(`Devloop worktrees:\n${lines.join("\n")}`, "info");
				} catch (error) {
					ctx.ui.notify(
						`Devloop cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				}
				return;
			}
			if (tokens[0] === "remove" && tokens[1]) {
				try {
					const workspace = await preflightGitWorkspace(runner, ctx.cwd);
					const activeRun = await getActiveDevloopRun();
					await removeDevloopWorktree(runner, workspace.repoRoot, tokens[1], {
						protectedWorktreePath: activeRun?.worktreePath,
					});
					ctx.ui.notify(`Devloop worktree "${tokens[1]}" removed.`, "info");
				} catch (error) {
					ctx.ui.notify(
						`Devloop cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
						"error",
					);
				}
				return;
			}
			ctx.ui.notify("Usage: /devloop-cleanup [list | remove <devloop/branch> | --retros [keep]]", "warning");
		},
	});


	pi.registerCommand("devloop-retro", {
		description: "List or read devloop run retrospectives (usage: /devloop-retro [runId] [--agent])",
		handler: async (args, ctx) => {
			const runner = toRunner(pi);
			const tokens = args.trim().split(/\s+/).filter((t) => t);
			const wantsAgent = tokens.includes("--agent");
			const runId = tokens.find((t) => t !== "--agent");
			try {
				const workspace = await preflightGitWorkspace(runner, ctx.cwd);
				if (!runId) {
					const retros = listRetros(workspace.repoRoot);
					if (retros.length === 0) {
						ctx.ui.notify("No devloop retrospectives found yet. Run /devloop first.", "info");
						return;
					}
					const lines = retros.map(
						(r) => `${r.runId} · ${r.label} · ${r.branch ?? "?"} · ${r.status ?? "?"}`,
					);
					ctx.ui.notify(`Devloop retrospectives:\n${lines.join("\n")}`, "info");
					return;
				}
				if (wantsAgent) {
					await runRetroAnalysis(pi, ctx, workspace.repoRoot, runId);
					ctx.ui.notify(`Devloop retrospective for ${runId} updated with recommendations.`, "info");
					return;
				}
				const metrics = readRetro(runId, workspace.repoRoot);
				if (!metrics) {
					ctx.ui.notify(`No devloop retrospective found for ${runId}. Run /devloop-retro to list.`, "warning");
					return;
				}
				const card: RetroCardData = {
					runId: metrics.meta.runId,
					label: metrics.meta.label,
					status: metrics.aggregate.runStatus,
					reason: metrics.aggregate.reason,
					totalDurationMs: metrics.aggregate.totalDurationMs,
					totalTokens: metrics.aggregate.totalTokens,
					totalToolCalls: metrics.aggregate.totalToolCalls,
					retries: metrics.aggregate.retries,
					escalations: metrics.aggregate.escalations,
					stageCount: metrics.stages.length,
				};
				pi.appendEntry(RETRO_ENTRY_TYPE, card);
				ctx.ui.notify(`Devloop retrospective ${runId} added to history (Ctrl+O to expand). Full report: .pi/devloop-sessions/${runId}.retro.md`, "info");
			} catch (error) {
				ctx.ui.notify(
					`Devloop retro failed: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("devloop-smoke", {
		description: "Smoke-test delegation v2 (usage: /devloop-smoke [agent...])",
		handler: async (args, ctx) => {
			const agents = args.trim() ? args.trim().split(/\s+/) : ["task-qa", "tester-complex", "security-triage"];
			if (agents.length > MAX_SMOKE_AGENTS_PER_RUN) {
				throw new Error(`Smoke accepts at most ${MAX_SMOKE_AGENTS_PER_RUN} agents per run; split the list across invocations.`);
			}
			const ownerRunId = `devloop-smoke-${randomUUID()}`;
			const results: string[] = [];
			for (const agent of agents) {
				try {
					const preflight = await resolveSubagentLaunchContract({ agent, cwd: ctx.cwd, context: "fresh", agentScope: "both", availableModels: ctx.modelRegistry.getAvailable(), artifacts: false, outputSchema: smokeResultSchema });
					if (!preflight.ok) throw new Error(`${preflight.code}: ${preflight.message}`);
					const request = buildSmokeRequest(agent, ctx.cwd, ownerRunId);
					const response = await delegate(pi, ctx, {
						request,
						statusKey: `smoke:${agent}`,
						timeoutMs: withTerminalResponseGrace(request.timeoutMs ?? 120_000),
					});
					if (response.status !== "completed" || response.result?.kind !== "structured") {
						throw new Error(`status ${response.status}: ${response.error ?? "missing structured result"}`);
					}
					if ((response.result.value as Record<string, unknown>).verdict !== "SMOKE_PASS") throw new Error("unexpected structured result");
					results.push(`${agent}: PASS`);
				} catch (error) { results.push(`${agent}: FAIL (${error instanceof Error ? error.message : String(error)})`); }
			}
			const failed = results.some((result) => result.includes("FAIL"));
			ctx.ui.notify(`Devloop smoke: ${results.join(" | ")}`, failed ? "error" : "info");
			if (failed) throw new Error(`Devloop smoke failed: ${results.filter((result) => result.includes("FAIL")).join(" | ")}`);
		},
	});
}