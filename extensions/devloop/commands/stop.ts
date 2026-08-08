import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { cancelActiveDevloopRun } from "../lib/cancellation";

/** `/devloop-stop` — cancel the active devloop run (aborts delegation). */
export function registerDevloopStop(pi: ExtensionAPI): void {
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
}
