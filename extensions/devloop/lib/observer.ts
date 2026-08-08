import type { GateCardData } from "./cards";
import { renderPipeline, type PanelTheme } from "./panel";
import { applyEvent, createPipeline, findLastStep, type PipelineEvent, type PipelineSnapshot } from "./pipeline";

/** Durable entry type appended per completed/failed gate. */
export const GATE_ENTRY_TYPE = "devloop:gate";

/**
 * Default trailing throttle for widget re-renders (ms). `live:update` events
 * can arrive in bursts (one per tool step), so we coalesce them: a pending
 * render is flushed shortly after the last event, not on every event.
 */
export const DEFAULT_RENDER_THROTTLE_MS = 80;

/** Interval at which running steps' elapsed time is re-rendered (ms). */
export const DEFAULT_TICK_INTERVAL_MS = 1000;

export interface PipelineObserverDeps {
	/** Human-readable run label shown in the widget header. */
	label: string;
	/** Whether to render the widget (TUI only). False → widget render is a no-op. */
	tuiEnabled: boolean;
	/** Render the widget with the given factory (or clear via `clearWidget`). */
	setWidget(content: unknown): void;
	/** Remove/clear the widget. */
	clearWidget(): void;
	/** Persist a durable entry (works in all modes). */
	appendEntry<T = unknown>(customType: string, data?: T): void;
	/** Trailing throttle for renders; default `DEFAULT_RENDER_THROTTLE_MS`. */
	renderThrottleMs?: number;
	/** Interval for re-rendering running steps' elapsed time; default `DEFAULT_TICK_INTERVAL_MS`. */
	tickIntervalMs?: number;
	/** Injectable scheduler (for tests). Defaults to `setTimeout`. */
	schedule?: (fn: () => void, ms: number) => unknown;
	/** Cancel a scheduled render. Defaults to `clearTimeout`. */
	cancel?: (handle: unknown) => void;
	/** Injectable interval starter (for tests). Defaults to `setInterval`. */
	startTick?: (fn: () => void, ms: number) => unknown;
	/** Injectable interval stopper (for tests). Defaults to `clearInterval`. */
	stopTick?: (handle: unknown) => void;
}

export interface PipelineObserver {
	onEvent(event: PipelineEvent): void;
	/** Flush any pending (throttled) render immediately. */
	render(): void;
	/** Cancel pending render and clear the widget. */
	clear(): void;
	/** Current snapshot for inspection (tests/debug). */
	snapshot(): PipelineSnapshot;
}

export function createPipelineObserver(deps: PipelineObserverDeps): PipelineObserver {
	const throttleMs = deps.renderThrottleMs ?? DEFAULT_RENDER_THROTTLE_MS;
	const tickIntervalMs = deps.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
	const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
	const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
	const startTick = deps.startTick ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
	const stopTick = deps.stopTick ?? ((handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>));

	let snapshot = createPipeline();
	let pending: unknown | undefined;
	let tickHandle: unknown | undefined;

	const renderNow = () => {
		pending = undefined;
		if (!deps.tuiEnabled) return;
		// `setWidget` receives a fresh factory closing over the current snapshot.
		deps.setWidget((tui: unknown, theme: unknown) => renderPipeline(snapshot, deps.label, theme as PanelTheme));
	};

	/**
	 * Start a periodic tick while any step is running so the elapsed runtime
	 * advances in real time; stop it once every step has closed.
	 */
	const syncTick = () => {
		const anyRunning = snapshot.steps.some((step) => step.status === "running");
		if (anyRunning && tickHandle === undefined) {
			tickHandle = startTick(() => renderNow(), tickIntervalMs);
		} else if (!anyRunning && tickHandle !== undefined) {
			stopTick(tickHandle);
			tickHandle = undefined;
		}
	};

	const scheduleRender = () => {
		if (pending !== undefined) return; // already scheduled
		pending = schedule(renderNow, throttleMs);
	};

	const appendGateCard = (event: Extract<PipelineEvent, { type: "stage:done" | "stage:failed" }>) => {
		const step = findLastStep(snapshot, event.unit, event.stage, event.agent);
		const isDone = event.type === "stage:done";
		const durationMs =
			step?.durationMs ??
			(step?.startedAt !== undefined ? Math.max(0, Date.now() - step.startedAt) : undefined);
		const data: GateCardData = {
			unit: event.unit,
			stage: event.stage,
			agent: event.agent,
			verdict: isDone ? event.verdict : undefined,
			summary: isDone ? event.summary : undefined,
			error: event.type === "stage:failed" ? event.error : undefined,
			findings: isDone ? event.findings : undefined,
			changedFiles: isDone ? event.changedFiles : undefined,
			tokens: step?.tokens,
			durationMs,
			toolCount: step?.toolCount,
		};
		deps.appendEntry<GateCardData>(GATE_ENTRY_TYPE, data);
	};

	return {
		onEvent(event) {
			snapshot = applyEvent(snapshot, event);
			syncTick();
			if (event.type === "stage:done" || event.type === "stage:failed") appendGateCard(event);
			scheduleRender();
		},
		render() {
			if (pending !== undefined) {
				cancel(pending);
				pending = undefined;
			}
			renderNow();
		},
		clear() {
			if (pending !== undefined) {
				cancel(pending);
				pending = undefined;
			}
			if (tickHandle !== undefined) {
				stopTick(tickHandle);
				tickHandle = undefined;
			}
			deps.clearWidget();
		},
		snapshot: () => snapshot,
	};
}
