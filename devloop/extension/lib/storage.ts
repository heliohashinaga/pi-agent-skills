import os from "node:os";
import path from "node:path";

/**
 * Centralized path definitions for devloop persistence.
 *
 * Devloop stores two categories of state:
 *
 * 1. **Global (per-machine)**: the lease/mutex that ensures at most one
 *    devloop run is active at a time. Lives under `~/.pi/agent/devloop/`.
 *
 * 2. **Per-repo**: the chain registry (stack), per-task session ledgers,
 *    and retrospectives. Lives under `<repoRoot>/.pi/devloop/`.
 *
 * Consolidating these paths in one module removes the hardcoded strings
 * scattered across `cancellation.ts`, `stack.ts`, `session.ts`, and `retro.ts`,
 * and makes future layout changes (e.g., migrating to XDG) a single-file edit.
 */

// =============================================================================
// Global paths (lease/mutex)
// =============================================================================

/** Base directory for global devloop state. */
export function globalBaseDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "devloop");
}

/** Global lease file (records the active run). */
export function globalLeaseFile(): string {
	return path.join(globalBaseDir(), "lease.json");
}

/** Global lease lock file. */
export function globalLeaseLockFile(): string {
	return path.join(globalBaseDir(), "lease.lock");
}

// =============================================================================
// Per-repo paths (stack, sessions, retros)
// =============================================================================

/** Base directory for per-repo devloop state. */
export function repoBaseDir(repoRoot: string): string {
	return path.join(repoRoot, ".pi", "devloop");
}

/** Stack registry file. */
export function stackFile(repoRoot: string): string {
	return path.join(repoBaseDir(repoRoot), "stack.json");
}

/** Stack lock file. */
export function stackLockFile(repoRoot: string): string {
	return path.join(repoBaseDir(repoRoot), "stack.lock");
}

/** Sessions directory (per-task ledgers + retrospectives). */
export function sessionsDir(repoRoot: string): string {
	return path.join(repoBaseDir(repoRoot), "sessions");
}

/** Per-task session ledger file. */
export function sessionFile(taskId: string, repoRoot: string): string {
	return path.join(sessionsDir(repoRoot), `${taskId}.json`);
}

/** Per-task plan file (written by the planner). */
export function planFile(taskId: string, repoRoot: string): string {
	return path.join(sessionsDir(repoRoot), `${taskId}-plan.json`);
}

/** Retrospective facts JSON. */
export function retroJsonFile(runId: string, repoRoot: string): string {
	return path.join(sessionsDir(repoRoot), `${runId}.retro.json`);
}

/** Retrospective human-readable report. */
export function retroMdFile(runId: string, repoRoot: string): string {
	return path.join(sessionsDir(repoRoot), `${runId}.retro.md`);
}

// =============================================================================
// Migration helpers (legacy paths)
// =============================================================================

/** Legacy global lease path (pre-Fase 6). */
export function legacyGlobalLeaseFile(): string {
	return path.join(os.homedir(), ".pi", "agent", "devloop-lease.json");
}

/** Legacy global lease lock path (pre-Fase 6). */
export function legacyGlobalLeaseLockFile(): string {
	return path.join(os.homedir(), ".pi", "agent", "devloop-lease.lock");
}

/** Legacy stack file (pre-Fase 6). */
export function legacyStackFile(repoRoot: string): string {
	return path.join(repoRoot, ".pi", "devloop-stack.json");
}

/** Legacy stack lock file (pre-Fase 6). */
export function legacyStackLockFile(repoRoot: string): string {
	return path.join(repoRoot, ".pi", "devloop-stack.lock");
}

/** Legacy sessions directory (pre-Fase 6). */
export function legacySessionsDir(repoRoot: string): string {
	return path.join(repoRoot, ".pi", "devloop-sessions");
}

/** Legacy session file (pre-Fase 6). */
export function legacySessionFile(taskId: string, repoRoot: string): string {
	return path.join(legacySessionsDir(repoRoot), `${taskId}.json`);
}

/** Legacy plan file (pre-Fase 6). */
export function legacyPlanFile(taskId: string, repoRoot: string): string {
	return path.join(legacySessionsDir(repoRoot), `${taskId}-plan.json`);
}

/** Legacy retro JSON file (pre-Fase 6). */
export function legacyRetroJsonFile(runId: string, repoRoot: string): string {
	return path.join(legacySessionsDir(repoRoot), `${runId}.retro.json`);
}

/** Legacy retro MD file (pre-Fase 6). */
export function legacyRetroMdFile(runId: string, repoRoot: string): string {
	return path.join(legacySessionsDir(repoRoot), `${runId}.retro.md`);
}

// =============================================================================
// Constants (for backward compatibility)
// =============================================================================

/** Old constant kept for backward compat with `stack.ts` imports. */
export const STACK_FILENAME = "devloop-stack.json";

/** Old constant kept for backward compat with `session.ts` imports. */
export const SESSIONS_DIR = ".pi/devloop/sessions";

/** Old constant kept for backward compat with `retro.ts` imports. */
export const RETRO_SUFFIX = ".retro";
