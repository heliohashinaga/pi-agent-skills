import type {
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import { renderGateCard, renderRetroCard, RETRO_ENTRY_TYPE, type GateCardData, type RetroCardData } from "./lib/cards";
import { GATE_ENTRY_TYPE } from "./lib/observer";
import { attachDevloopInterrupt, DevloopInterruptEditor } from "./lib/interrupt";
import { registerDevloop } from "./commands/devloop";
import { registerDevloopStop } from "./commands/stop";
import { registerDevloopCleanup } from "./commands/cleanup";
import { registerDevloopRetro } from "./commands/retro";
import { registerDevloopSmoke } from "./commands/smoke";

/**
 * devloop extension entrypoint.
 *
 * Only wires pi lifecycle hooks (session_start editor + durable entry renderers)
 * and delegates the five `/devloop*` commands to their modules. All run
 * orchestration lives in `lib/run.ts`; command handlers in `commands/`.
 */
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

	registerDevloop(pi);
	registerDevloopStop(pi);
	registerDevloopCleanup(pi);
	registerDevloopRetro(pi);
	registerDevloopSmoke(pi);
}
