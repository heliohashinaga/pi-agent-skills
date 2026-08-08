import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	SUBAGENT_DELEGATION_CANCEL_EVENT,
	SUBAGENT_DELEGATION_REQUEST_EVENT,
	SUBAGENT_DELEGATION_RESPONSE_EVENT,
	SUBAGENT_DELEGATION_STARTED_EVENT,
	SUBAGENT_DELEGATION_UPDATE_EVENT,
	type SubagentDelegationCancel,
	type SubagentDelegationRequest as SubagentDelegationV2Request,
	type SubagentDelegationResponse as SubagentDelegationV2Response,
	type SubagentDelegationStarted as SubagentDelegationV2Started,
	type SubagentDelegationUpdate as SubagentDelegationV2Update,
} from "pi-subagents/delegation";

import { DevloopDelegationError } from "./errors";

export interface DelegateOptions {
	request: SubagentDelegationV2Request;
	timeoutMs?: number;
	statusKey: string;
	/** External signal to cancel the delegation (e.g. from Esc during command execution). */
	signal?: AbortSignal;
	/** Optional live telemetry callback (tool/duration/tokens) for visualization. */
	onUpdate?: (update: {
		tool?: string;
		toolCount?: number;
		tokens?: number;
		durationMs?: number;
		model?: string;
	}) => void;
}

const UNAVAILABLE_CONTEXT_GRACE_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 300_000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function isV2Started(value: unknown): value is SubagentDelegationV2Started {
	const record = asRecord(value);
	return record !== undefined && typeof record.requestId === "string";
}

function isV2Response(value: unknown): value is SubagentDelegationV2Response {
	const record = asRecord(value);
	return record !== undefined && typeof record.requestId === "string";
}

function isV2Update(value: unknown): value is SubagentDelegationV2Update {
	const record = asRecord(value);
	return record !== undefined && typeof record.requestId === "string";
}

function matchesRequest(
	response: SubagentDelegationV2Started | SubagentDelegationV2Response | SubagentDelegationV2Update,
	request: SubagentDelegationV2Request,
): boolean {
	return (
		response.requestId === request.requestId &&
		response.ownerRunId === request.ownerRunId &&
		response.nodeId === request.nodeId
	);
}

function toCancel(request: SubagentDelegationV2Request): SubagentDelegationCancel {
	return {
		requestId: request.requestId,
		ownerRunId: request.ownerRunId,
		nodeId: request.nodeId,
	};
}

export async function delegate(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	options: DelegateOptions,
): Promise<SubagentDelegationV2Response> {
	const { request, statusKey } = options;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	// AbortSignal events are not replayed for listeners attached after abort().
	// Without this guard, stopping during devloop preflight could still dispatch
	// the next child because its delegate listener would never observe the abort.
	if (ctx.signal?.aborted || options.signal?.aborted) {
		throw new DevloopDelegationError("cancelled", "Devloop delegation was cancelled before it started.", { agent: request.agent });
	}

	return await new Promise<SubagentDelegationV2Response>((resolve, reject) => {
		let settled = false;
		let started = false;
		let unavailableContextTimer: ReturnType<typeof setTimeout> | undefined;

		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (unavailableContextTimer) clearTimeout(unavailableContextTimer);
			unsubscribeResponse();
			unsubscribeStarted();
			unsubscribeUpdate();
			ctx.signal?.removeEventListener("abort", onAbort);
			options.signal?.removeEventListener("abort", onExternalAbort);
			ctx.ui.setStatus(statusKey, undefined);
			callback();
		};

		const cancel = () => pi.events.emit(SUBAGENT_DELEGATION_CANCEL_EVENT, toCancel(request));

		const onAbort = () => {
			cancel();
			finish(() => reject(new DevloopDelegationError("cancelled", "Devloop delegation was cancelled.", { agent: request.agent })));
		};

		const onExternalAbort = () => {
			cancel();
			finish(() => reject(new DevloopDelegationError("cancelled", "Devloop delegation was cancelled (Esc).", { agent: request.agent })));
		};

		const unsubscribeResponse = pi.events.on(SUBAGENT_DELEGATION_RESPONSE_EVENT, (value) => {
			if (!isV2Response(value) || !matchesRequest(value, request)) return;
			if (value.status === "unavailable_context" && !started) {
				unavailableContextTimer ??= setTimeout(() => finish(() => resolve(value)), UNAVAILABLE_CONTEXT_GRACE_MS);
				return;
			}
			finish(() => resolve(value));
		});

		const unsubscribeStarted = pi.events.on(SUBAGENT_DELEGATION_STARTED_EVENT, (value) => {
			if (!isV2Started(value) || !matchesRequest(value, request)) return;
			started = true;
			if (unavailableContextTimer) {
				clearTimeout(unavailableContextTimer);
				unavailableContextTimer = undefined;
			}
		});

		const unsubscribeUpdate = pi.events.on(SUBAGENT_DELEGATION_UPDATE_EVENT, (value) => {
			if (!isV2Update(value) || !matchesRequest(value, request)) return;
			const message = value.currentTool
				? `Devloop: ${request.agent} running ${value.currentTool}`
				: `Devloop: ${request.agent} running`;
			ctx.ui.setStatus(statusKey, message);
			options.onUpdate?.({
				tool: value.currentTool,
				toolCount: value.toolCount,
				tokens: value.tokens,
				durationMs: value.durationMs,
				model: value.model,
			});
		});

		const timeout = setTimeout(() => {
			cancel();
			const childTimeout = request.timeoutMs;
			const deadlineDetail = childTimeout === undefined
				? ""
				: ` (child deadline: ${childTimeout}ms)`;
			finish(() => reject(new DevloopDelegationError(
				"timed_out",
				`Delegation for ${request.agent} did not settle after ${timeoutMs}ms${deadlineDetail}.`,
				{ agent: request.agent },
			)));
		}, timeoutMs);

		ctx.signal?.addEventListener("abort", onAbort, { once: true });
		options.signal?.addEventListener("abort", onExternalAbort, { once: true });
		ctx.ui.setStatus(statusKey, `Devloop: starting ${request.agent}`);
		pi.events.emit(SUBAGENT_DELEGATION_REQUEST_EVENT, request);
	});
}