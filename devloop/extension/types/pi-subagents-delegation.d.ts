/**
 * Compile-time surface consumed from pi-subagents. Runtime smoke validates the
 * installed protocol implementation; keep this shim in sync when that API moves.
 */
export const SUBAGENT_DELEGATION_REQUEST_EVENT: string;
export const SUBAGENT_DELEGATION_RESPONSE_EVENT: string;
export const SUBAGENT_DELEGATION_STARTED_EVENT: string;
export const SUBAGENT_DELEGATION_UPDATE_EVENT: string;
export const SUBAGENT_DELEGATION_CANCEL_EVENT: string;

export interface SubagentDelegationRequest {
	requestId: string;
	ownerRunId: string;
	nodeId: string;
	agent: string;
	task: string;
	context: "fresh" | "fork";
	cwd: string;
	model?: string;
	skill?: string | string[] | boolean;
	timeoutMs?: number;
	turnBudget?: { maxTurns: number; graceTurns?: number };
	toolBudget?: { hard: number; soft?: number; block?: string[] | "*" };
	artifacts?: boolean;
	result: { kind: "text" } | { kind: "structured"; schema: object };
}

export interface SubagentDelegationStarted {
	requestId: string;
	ownerRunId: string;
	nodeId: string;
}

export interface SubagentDelegationCancel extends SubagentDelegationStarted {}

export interface SubagentDelegationResult {
	kind: "text" | "structured";
	text?: string;
	value?: unknown;
}

export interface SubagentDelegationUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	turns: number;
	toolCalls: number;
	durationMs: number;
}

export interface SubagentDelegationResponse extends SubagentDelegationStarted {
	status: string;
	result?: SubagentDelegationResult;
	error?: string;
	model?: string;
	usage?: SubagentDelegationUsage;
}

export interface SubagentDelegationUpdate extends SubagentDelegationStarted {
	runId?: string;
	currentTool?: string;
	currentToolArgs?: string;
	recentOutput?: string;
	recentOutputLines?: string[];
	recentTools?: Array<{ tool: string; args: string }>;
	model?: string;
	toolCount?: number;
	durationMs?: number;
	tokens?: number;
}
