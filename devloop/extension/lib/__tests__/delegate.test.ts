import { describe, expect, test } from "bun:test";

import { delegate } from "../delegate";

class EventBus {
	readonly emitted: Array<{ event: string; value: unknown }> = [];

	emit(event: string, value: unknown): void {
		this.emitted.push({ event, value });
	}

	on(_event: string, _listener: (value: unknown) => void): () => void {
		return () => {};
	}
}

const request = {
	requestId: "request-1",
	ownerRunId: "run-1",
	nodeId: "node-1",
	agent: "tester-simple",
	task: "Do nothing.",
	context: "fresh" as const,
	cwd: "/tmp",
	result: { kind: "text" as const },
};

describe("delegation cancellation", () => {
	test("does not dispatch a child after the devloop signal was already aborted", async () => {
		const events = new EventBus();
		const controller = new AbortController();
		controller.abort();

		await expect(delegate(
			{ events } as never,
			{
				signal: undefined,
				ui: { setStatus: () => {} },
			} as never,
			{ request, statusKey: "devloop:test", signal: controller.signal },
		)).rejects.toThrow("cancelled before it started");

		expect(events.emitted).toEqual([]);
	});

	test("emits the host's structured cancellation payload", async () => {
		const events = new EventBus();
		const controller = new AbortController();
		const pending = delegate(
			{ events } as never,
			{
				signal: undefined,
				ui: { setStatus: () => {} },
			} as never,
			{ request, statusKey: "devloop:test", signal: controller.signal },
		);

		controller.abort();
		await expect(pending).rejects.toThrow("cancelled (Esc)");
		expect(events.emitted).toEqual([
			{ event: "prompt-template:subagent:request", value: request },
			{
				event: "prompt-template:subagent:cancel",
				value: { requestId: "request-1", ownerRunId: "run-1", nodeId: "node-1" },
			},
		]);
	});
});
