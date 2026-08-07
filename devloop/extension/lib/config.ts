import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { GateStage } from "./contracts";

export const CONFIG_FILENAME = ".pi/devloop.json";

/** Default maximum runtime for an individual child gate. */
export const DEFAULT_STAGE_TIMEOUT_MS = 300_000;
/** Extra time for a timed-out child to publish its terminal response. */
export const TERMINAL_RESPONSE_GRACE_MS = 15_000;

const GATE_STAGES = [
	"planner",
	"task-qa",
	"code",
	"review",
	"test",
	"security",
	"security-deep",
	"documentation",
	"integrate",
] as const satisfies readonly GateStage[];

/** Conventional candidates tried when no config and no --tasks flag is supplied. */
export const DEFAULT_TASK_CANDIDATES = ["tasks.md", "specs/tasks.md", "docs/tasks.md"];

export type StageTimeouts = Partial<Record<GateStage, number>>;

export interface StackConfigSource {
	name?: string;
	base?: string;
}

export interface RetroConfigSource {
	/**
	 * Post-run: dispatch the read-only `retro` agent to produce recommendations.
	 * Never runs on the critical merge path; defaults false.
	 */
	recommend?: boolean;
}

export interface DevloopConfigSource {
	tasksPath?: string;
	stageTimeoutMs?: StageTimeouts;
	stack?: StackConfigSource;
	keepWorktreeOnSuccess?: boolean;
	retro?: RetroConfigSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGateStage(value: string): value is GateStage {
	return (GATE_STAGES as readonly string[]).includes(value);
}

function parseStageTimeouts(value: unknown): StageTimeouts {
	if (!isRecord(value)) throw new Error(`${CONFIG_FILENAME} "stageTimeoutMs" must be an object.`);

	const timeouts: StageTimeouts = {};
	for (const [stage, timeoutMs] of Object.entries(value)) {
		if (!isGateStage(stage)) throw new Error(`${CONFIG_FILENAME} has an unknown stage timeout: ${stage}.`);
		if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
			throw new Error(`${CONFIG_FILENAME} timeout for ${stage} must be a positive integer.`);
		}
		timeouts[stage] = timeoutMs;
	}
	return timeouts;
}

function parseStack(value: unknown): StackConfigSource | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error(`${CONFIG_FILENAME} "stack" must be an object.`);
	if (value.name !== undefined && typeof value.name !== "string") {
		throw new Error(`${CONFIG_FILENAME} "stack.name" must be a string.`);
	}
	if (value.base !== undefined && typeof value.base !== "string") {
		throw new Error(`${CONFIG_FILENAME} "stack.base" must be a string.`);
	}
	return {
		...(typeof value.name === "string" ? { name: value.name } : {}),
		...(typeof value.base === "string" ? { base: value.base } : {}),
	};
}

function parseRetro(value: unknown): RetroConfigSource | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error(`${CONFIG_FILENAME} "retro" must be an object.`);
	if (value.recommend !== undefined && typeof value.recommend !== "boolean") {
		throw new Error(`${CONFIG_FILENAME} "retro.recommend" must be a boolean.`);
	}
	return {
		...(typeof value.recommend === "boolean" ? { recommend: value.recommend } : {}),
	};
}

/** Parses and validates the project-level devloop configuration. */
export function parseDevloopConfig(configText: string | undefined): DevloopConfigSource | undefined {
	if (configText === undefined) return undefined;

	let parsed: unknown;
	try {
		parsed = JSON.parse(configText);
	} catch {
		throw new Error(`Invalid ${CONFIG_FILENAME}: not valid JSON.`);
	}
	if (!isRecord(parsed)) throw new Error(`Invalid ${CONFIG_FILENAME}: expected an object.`);
	if (parsed.tasksPath !== undefined && typeof parsed.tasksPath !== "string") {
		throw new Error(`${CONFIG_FILENAME} "tasksPath" must be a string.`);
	}

	const keepWorktreeOnSuccess =
		parsed.keepWorktreeOnSuccess === undefined
			? undefined
			: (() => {
					if (typeof parsed.keepWorktreeOnSuccess !== "boolean") {
						throw new Error(`${CONFIG_FILENAME} "keepWorktreeOnSuccess" must be a boolean.`);
					}
					return parsed.keepWorktreeOnSuccess;
				})();

	return {
		...(typeof parsed.tasksPath === "string" ? { tasksPath: parsed.tasksPath } : {}),
		...(parsed.stageTimeoutMs === undefined ? {} : { stageTimeoutMs: parseStageTimeouts(parsed.stageTimeoutMs) }),
		...(parsed.stack === undefined ? {} : { stack: parseStack(parsed.stack) }),
		...(keepWorktreeOnSuccess === undefined ? {} : { keepWorktreeOnSuccess }),
		...(parsed.retro === undefined ? {} : { retro: parseRetro(parsed.retro) }),
	};
}

/** Resolves an individual child deadline, applying the project override if supplied. */
export function resolveStageTimeoutMs(stage: GateStage, config: DevloopConfigSource | undefined): number {
	return config?.stageTimeoutMs?.[stage] ?? DEFAULT_STAGE_TIMEOUT_MS;
}

/** The outer watchdog waits briefly for the child's structured terminal response. */
export function withTerminalResponseGrace(childTimeoutMs: number): number {
	return childTimeoutMs + TERMINAL_RESPONSE_GRACE_MS;
}

/**
 * Resolve the tasks markdown path for a repository, with the hierarchy:
 *   1. explicit --tasks <path> (flag arg wins),
 *   2. .pi/devloop.json in the repo root (config),
 *   3. first existing conventional candidate,
 *   4. otherwise throw a clear error telling the user how to fix it.
 */
export function resolveTasksPath(
	repoRoot: string,
	flagPath: string | undefined,
	config: DevloopConfigSource | undefined,
	existed: (candidate: string) => boolean,
): string {
	if (flagPath) return path.isAbsolute(flagPath) ? flagPath : path.join(repoRoot, flagPath);

	if (config) {
		if (config.tasksPath) {
			return path.isAbsolute(config.tasksPath) ? config.tasksPath : path.join(repoRoot, config.tasksPath);
		}
		throw new Error(`${CONFIG_FILENAME} is missing "tasksPath".`);
	}

	for (const candidate of DEFAULT_TASK_CANDIDATES) {
		const full = `${repoRoot}/${candidate}`;
		if (existed(candidate)) return full;
	}

	throw new Error(
		`No tasks file found. Create ${CONFIG_FILENAME} with {"tasksPath":"..."} or pass --tasks <path>.`,
	);
}

export function readConfigText(repoRoot: string): { text?: string; path: string } {
	const configPath = `${repoRoot}/${CONFIG_FILENAME}`;
	return { text: existsSync(configPath) ? readFileSync(configPath, "utf8") : undefined, path: configPath };
}
