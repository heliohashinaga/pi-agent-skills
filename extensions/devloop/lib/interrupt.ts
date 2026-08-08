import {
	CustomEditor,
	type EditorComponentFactory,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

import { cancelActiveDevloopRun } from "./cancellation";

/**
 * Esc → cancel the active devloop run.
 *
 * The built-in app.interrupt handler only aborts active agent streams, not
 * extension command handlers. While devloop owns a long-running command we
 * give Esc precedence: if a devloop run is active, Esc cancels it; otherwise
 * Esc falls through to the editor's previous behavior. Installing this at run
 * start (not just session_start) keeps cancellation robust against later
 * editor extensions replacing the factory.
 */

/** Try to cancel the active run; true when an in-memory run was aborted. */
function cancelFromEscape(): boolean {
	const result = cancelActiveDevloopRun();
	return result?.status === "cancelled";
}

/**
 * CustomEditor that intercepts Esc while a devloop run owns the command. Only
 * swallows the key when it actually cancels a run; otherwise delegates to the
 * default input handling so autocomplete/other bindings keep working.
 */
export class DevloopInterruptEditor extends CustomEditor {
	override handleInput(data: string): void {
		if (!this.isShowingAutocomplete() && matchesKey(data, "escape") && cancelFromEscape()) return;
		super.handleInput(data);
	}
}

/** Attach devloop cancellation to an existing editor's standard Esc callback. */
export function attachDevloopInterrupt(editor: CustomEditor): void {
	const previousOnEscape = editor.onEscape;
	editor.onEscape = () => {
		if (!cancelFromEscape()) previousOnEscape?.();
	};
}

/**
 * Install the Esc handler at run start, after every session-start extension
 * (notably stickybar) has finished choosing its editor. Installing only from
 * devloop's session_start is order-dependent: a later editor extension can
 * replace the factory and silently remove cancellation. Returns a restore
 * function that reinstalls the previous editor (without clobbering one a
 * sibling extension installed during the run).
 */
export function installRunInterrupt(ctx: ExtensionCommandContext): () => void {
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
