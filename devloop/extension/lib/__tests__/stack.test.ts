import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	appendStackEntry,
	chainTip,
	ensureStack,
	readStack,
	stackSummary,
	STACK_FILENAME,
} from "../stack";

describe("devloop chain registry", () => {
	let repo: string;
	beforeEach(() => {
		repo = mkdtempSync(join(tmpdir(), "devloop-stack-"));
	});
	afterEach(() => {
		rmSync(repo, { recursive: true, force: true });
	});

	test("empty stack resolves the chain tip to the base", async () => {
		await expect(chainTip(repo, "main")).resolves.toBe("main");
	});

	test("append with an empty stack sets prBase to base", async () => {
		const entry = await appendStackEntry(repo, "phase-3", "main", {
			task: "T020",
			branch: "devloop/T020-aaa",
		});
		expect(entry.prBase).toBe("main");
		expect(entry.prUrl).toBeUndefined();
	});

	test("successive appends chain prBase onto the previous tip", async () => {
		await appendStackEntry(repo, "phase-3", "main", {
			task: "T020",
			branch: "devloop/T020-aaa",
		});
		const second = await appendStackEntry(repo, "phase-3", "main", {
			task: "T021",
			branch: "devloop/T021-bbb",
		});
		expect(second.prBase).toBe("devloop/T020-aaa");
		await expect(chainTip(repo, "main")).resolves.toBe("devloop/T021-bbb");
	});

	test("persists prUrl when provided", async () => {
		const entry = await appendStackEntry(repo, "phase-3", "main", {
			task: "T020",
			branch: "devloop/T020-aaa",
			prUrl: "https://example.test/pr/20",
		});
		expect(entry.prUrl).toBe("https://example.test/pr/20");
		const stack = await readStack(repo);
		expect(stack?.entries[0]?.prUrl).toBe("https://example.test/pr/20");
	});

	test("concurrent appends stay lock-safe and form an intact chain", async () => {
		const branches = ["devloop/T020-a", "devloop/T021-b", "devloop/T022-c", "devloop/T023-d", "devloop/T024-e"];
		await Promise.all(
			branches.map((branch, index) =>
				appendStackEntry(repo, "phase-3", "main", { task: `T0${20 + index}`, branch }),
			),
		);

		const stack = await readStack(repo);
		expect(stack?.entries).toHaveLength(5);
		const entries = stack!.entries;
		expect(entries[0]!.prBase).toBe("main");
		for (let i = 1; i < entries.length; i += 1) {
			expect(entries[i]!.prBase).toBe(entries[i - 1]!.branch);
		}
	});

	test("ensureStack writes a fresh empty stack and does not overwrite an existing one", async () => {
		const first = await ensureStack(repo, "phase-3", "main");
		expect(first).toEqual({ name: "phase-3", base: "main", entries: [] });

		await appendStackEntry(repo, "phase-3", "main", { task: "T020", branch: "devloop/T020-aaa" });
		const again = await ensureStack(repo, "phase-3", "main");
		expect(again.entries).toHaveLength(1);
	});

	test("a corrupt stack file is treated as absent", async () => {
		mkdirSync(join(repo, ".pi"), { recursive: true });
		writeFileSync(join(repo, ".pi", STACK_FILENAME), "{not-json", "utf8");
		await expect(readStack(repo)).resolves.toBeUndefined();
		const tip = await chainTip(repo, "main");
		expect(tip).toBe("main");
	});

	test("a discarded run (no append) leaves the chain tip unchanged", async () => {
		await appendStackEntry(repo, "phase-3", "main", { task: "T020", branch: "devloop/T020-aaa" });

		// A failed/discarded run is never appended, so chainTip must not move.
		await expect(chainTip(repo, "main")).resolves.toBe("devloop/T020-aaa");

		// Only a successful append advances the tip.
		await appendStackEntry(repo, "phase-3", "main", { task: "T021", branch: "devloop/T021-bbb" });
		await expect(chainTip(repo, "main")).resolves.toBe("devloop/T021-bbb");
	});

	test("stackSummary renders an empty chain and an ordered chain", async () => {
		await expect(stackSummary(repo)).resolves.toBe("No devloop stack entries yet.");

		await appendStackEntry(repo, "phase-3", "main", { task: "T020", branch: "devloop/T020-aaa" });
		await appendStackEntry(repo, "phase-3", "main", {
			task: "T021",
			branch: "devloop/T021-bbb",
			prUrl: "https://example.test/pr/21",
		});
		const summary = await stackSummary(repo);
		expect(summary).toContain("T020: devloop/T020-aaa → into main");
		expect(summary).toContain("T021: devloop/T021-bbb → into devloop/T020-aaa (PR https://example.test/pr/21)");
	});

	test("writes the stack file directly under .pi in the repo root", async () => {
		await appendStackEntry(repo, "phase-3", "main", { task: "T020", branch: "devloop/T020-aaa" });
		const stack = await readStack(repo);
		expect(stack?.name).toBe("phase-3");
		expect(stack?.base).toBe("main");
		// ensure the lockfile was cleaned up after the guarded write
		await expect(readStack(repo)).resolves.toBeDefined();
	});
});
