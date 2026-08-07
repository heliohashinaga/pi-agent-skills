/**
 * Compile-time surface consumed by the extension. Keep this aligned with the
 * installed Pi runtime; runtime smoke validates the real implementation.
 *
 * The `ui` surface mirrors `ExtensionUIContext` and the API mirrors
 * `ExtensionAPI` from `@earendil-works/pi-coding-agent` (installed as a
 * devDependency since v0.83). We intentionally keep a controlled shim here so
 * the extension does not couple to the full pi type surface; only the members
 * the devloop actually uses (or will use for its execution visualization) are
 * declared.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";

export class CustomEditor {
	constructor(tui: TUI, theme: ExtensionTheme, keybindings: unknown);
	isShowingAutocomplete(): boolean;
	onEscape?: () => void;
	handleInput(data: string): void;
}

/**
 * Structural subset of the runtime session Theme used for widget/entry
 * rendering. The runtime passes the full Theme; we only depend on the
 * members we use so the shim stays decoupled from pi's internal theme type
 * (which is not exported).
 */
export interface ExtensionTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

/** Rendering options passed to entry/message renderers. */
export interface EntryRenderOptions {
	expanded: boolean;
}

/** Durable custom entry appended via `pi.appendEntry` (not sent to the LLM). */
export interface CustomEntry<T = unknown> {
	type: "custom";
	customType: string;
	data?: T;
	id?: string;
	timestamp?: number;
}

export interface ExtensionAPI {
	exec(command: string, args: string[], options: unknown): Promise<{ code: number; stdout: string; stderr: string }>;
	events: {
		emit(event: string, value: unknown): void;
		on(event: string, listener: (value: unknown) => void): () => void;
	};
	on(
		event: "session_start",
		handler: (event: unknown, ctx: ExtensionCommandContext) => Promise<void> | void,
	): void;
	registerCommand(
		name: string,
		command: {
			description?: string;
			handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
		},
	): void;
	/** Register a custom renderer for durable custom entries (no LLM context). */
	registerEntryRenderer<T = unknown>(customType: string, renderer: EntryRenderer<T>): void;
	/** Append a durable custom entry (not sent to the LLM). */
	appendEntry<T = unknown>(customType: string, data?: T): void;
}

/** The renderer signature matches the runtime `EntryRenderer<T>` function type. */
export type EntryRenderer<T = unknown> = (
	entry: CustomEntry<T>,
	options: EntryRenderOptions,
	theme: ExtensionTheme,
) => Component | undefined;

export interface WorkingIndicatorOptions {
	frames?: string[];
	intervalMs?: number;
}

export interface ExtensionWidgetOptions {
	placement?: "aboveEditor" | "belowEditor";
}

export type WidgetContent =
	| string[]
	| ((tui: TUI, theme: ExtensionTheme) => Component & { dispose?(): void })
	| undefined;

export type EditorComponentFactory = (tui: TUI, theme: ExtensionTheme, keybindings: unknown) => CustomEditor;

export interface ExtensionCommandContext {
	cwd: string;
	signal?: AbortSignal;
	model?: { provider: string; id: string };
	modelRegistry: { getAvailable(): unknown[] };
	hasUI: boolean;
	mode: "tui" | "rpc" | "json" | "print";
	ui: {
		notify(message: string, level?: "info" | "error" | "warning"): void;
		setStatus(key: string, value: string | undefined): void;
		setWorkingMessage(message?: string): void;
		setWorkingVisible(visible: boolean): void;
		setWorkingIndicator(options?: WorkingIndicatorOptions): void;
		setWidget(key: string, content: WidgetContent, options?: ExtensionWidgetOptions): void;
		setTitle(title: string): void;
		getEditorComponent(): EditorComponentFactory | undefined;
		setEditorComponent(factory: EditorComponentFactory | undefined): void;
		theme: ExtensionTheme;
	};
}
