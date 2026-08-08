import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import {
	beginDevloopRun,
	clearActiveDevloopRun,
	hasActiveDevloopRun,
} from "../lib/cancellation";
import { installRunInterrupt } from "../lib/interrupt";
import { runDevloop } from "../lib/run";

/** `/devloop` — run a task, phase, or range through the automated devloop. */
export function registerDevloop(pi: ExtensionAPI): void {
	pi.registerCommand("devloop", {
		description: "Run a task, phase, or range through the automated devloop (usage: /devloop <TASK|phase-N|A-B>)",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			// Reject if another devloop is already running.
			if (hasActiveDevloopRun()) {
				ctx.ui.notify("A devloop run is already in progress. Use /devloop-stop to cancel it first.", "warning");
				return;
			}

			const abortController = await beginDevloopRun();
			const restoreInterrupt = installRunInterrupt(ctx);

			try {
				await runDevloop(pi, ctx, args, abortController);
			} catch (error) {
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
}
