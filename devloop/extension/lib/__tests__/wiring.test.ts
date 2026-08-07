import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	_forgetInMemoryRunForTests,
	_resetCancellationForTests,
	_setLeaseDirForTests,
	beginDevloopRun,
	clearActiveDevloopRun,
} from "../cancellation";
import { gateResultSchemas } from "../contracts";
import devloopExtension from "../../index";

// Minimal fake ExtensionAPI — enough to exercise command registration and
// verify that commands are registered, produce correct notifications, and
// respect the Esc/cancellation lifecycle.
function fakePi() {
	const commands: Record<string, { description: string; handler: (...args: unknown[]) => void }> = {};
	const sessionStartHandlers: Array<(event: unknown, ctx: unknown) => void> = [];
	const notifyCalls: Array<{ message: string; level: string }> = [];
	const widgets: Record<string, unknown> = {};
	let editorFactory: unknown = null;

	const pi = {
		on: (event: string, handler: (event: unknown, ctx: unknown) => void) => {
			if (event === "session_start") sessionStartHandlers.push(handler);
		},
		registerCommand: (name: string, cmd: { description?: string; handler: (...args: unknown[]) => void }) => {
			commands[name] = { description: cmd.description ?? "", handler: cmd.handler };
		},
		registerEntryRenderer: () => {},
		exec: async (command: string, args: string[]) => {
			if (command === "git") {
				if (args[0] === "status" && args[1] === "--porcelain") return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		},
		events: {
			emit: () => {},
			on: () => () => {},
		},
		appendEntry: () => {},
	};

	const ctx = {
		cwd: "/test/repo",
		mode: "tui" as const,
		hasUI: true,
		modelRegistry: { getAvailable: () => [] },
		ui: {
			notify: (message: string, level?: string) => notifyCalls.push({ message, level: level ?? "info" }),
			setStatus: () => {},
			setWorkingMessage: () => {},
			setWorkingVisible: () => {},
			setWorkingIndicator: () => {},
			setWidget: (key: string, content: unknown) => { widgets[key] = content; },
			setTitle: () => {},
			getEditorComponent: () => editorFactory,
			setEditorComponent: (factory: unknown) => { editorFactory = factory; },
			theme: { fg: (c: string, t: string) => t, bold: (t: string) => t },
		},
	};

	return { pi, ctx, commands, notifyCalls, sessionStartHandlers, widgets, editorFactory };
}

describe("devloop wiring (ExtensionAPI fake)", () => {
	let testDir: string;

	beforeAll(() => {
		testDir = mkdtempSync(path.join(tmpdir(), "devloop-wiring-"));
		_setLeaseDirForTests(testDir);
	});

	afterAll(async () => {
		await _resetCancellationForTests();
	});

	test("registers all four commands (devloop, devloop-stop, devloop-cleanup, devloop-smoke)", () => {
		const { pi, commands } = fakePi();
		devloopExtension(pi as any);

		expect(commands["devloop"]).toBeTruthy();
		expect(commands["devloop"]!.description).toContain("devloop");
		expect(commands["devloop-stop"]).toBeTruthy();
		expect(commands["devloop-cleanup"]).toBeTruthy();
		expect(commands["devloop-smoke"]).toBeTruthy();
	});

	test("devloop-stop with no active run notifies accordingly", async () => {
		const { pi, ctx, commands, notifyCalls } = fakePi();
		devloopExtension(pi as any);

		await commands["devloop-stop"]!.handler("", ctx as any);
		expect(notifyCalls.some((c) => c.message.includes("No devloop run is active"))).toBe(true);
	});

	test("devloop-cleanup list with no worktrees notifies gracefully", async () => {
		const { pi, ctx, commands, notifyCalls } = fakePi();
		// preflightGitWorkspace needs a git repo. Inject a fake git response.
		pi.exec = async (command: string, args: string[]) => {
			if (command === "git") {
				if (args[0] === "rev-parse") return { code: 0, stdout: "/test/repo\n", stderr: "" };
				if (args[0] === "status") return { code: 0, stdout: "", stderr: "" };
				if (args[0] === "branch" && args[1] === "--show-current") return { code: 0, stdout: "main\n", stderr: "" };
				if (args[0] === "worktree" && args[1] === "list") return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		};
		devloopExtension(pi as any);

		await commands["devloop-cleanup"]!.handler("list", ctx as any);
		expect(notifyCalls.some((c) => c.message.includes("No devloop worktrees found"))).toBe(true);
	});

	test("session_start editor routes Esc to the active cancellation controller", async () => {
		const { pi, sessionStartHandlers } = fakePi();
		let previousEscapeCalls = 0;
		const previousFactory = () => ({
			handleInput: () => {},
			isShowingAutocomplete: () => false,
			onEscape: () => { previousEscapeCalls += 1; },
		});
		let installedFactory: ((...args: unknown[]) => { onEscape?: () => void }) | undefined;
		devloopExtension(pi as any);

		const ctx = {
			cwd: "/test/repo",
			mode: "tui" as const,
			hasUI: true,
			ui: {
				getEditorComponent: () => previousFactory,
				setEditorComponent: (factory: typeof installedFactory) => { installedFactory = factory; },
			},
			modelRegistry: { getAvailable: () => [] },
		};
		sessionStartHandlers[0]!({}, ctx as any);
		expect(installedFactory).toBeTruthy();

		const controller = await beginDevloopRun();
		const editor = installedFactory!({}, {}, {});
		editor.onEscape?.();
		expect(controller.signal.aborted).toBe(true);
		expect(previousEscapeCalls).toBe(0);
		await clearActiveDevloopRun(controller);
	});

	test("Esc falls back to the previous handler when reload lost cancellation ownership", async () => {
		const { pi, sessionStartHandlers } = fakePi();
		let previousEscapeCalls = 0;
		const previousFactory = () => ({
			handleInput: () => {},
			isShowingAutocomplete: () => false,
			onEscape: () => { previousEscapeCalls += 1; },
		});
		let installedFactory: ((...args: unknown[]) => { onEscape?: () => void }) | undefined;
		devloopExtension(pi as any);
		sessionStartHandlers[0]!({}, {
			cwd: "/test/repo", mode: "tui", hasUI: true,
			ui: {
				getEditorComponent: () => previousFactory,
				setEditorComponent: (factory: typeof installedFactory) => { installedFactory = factory; },
			},
			modelRegistry: { getAvailable: () => [] },
		} as any);

		const controller = await beginDevloopRun();
		_forgetInMemoryRunForTests();
		installedFactory!({}, {}, {}).onEscape?.();
		expect(previousEscapeCalls).toBe(1);
		expect(controller.signal.aborted).toBe(false);
		await _resetCancellationForTests();
	});
});

describe("devloop schema validation", () => {
	test("planner schema requires skills with enum and uniqueItems", () => {
		const schema = gateResultSchemas.planner;
		expect(schema.required).toContain("skills");
		expect(schema.properties.skills).toBeTruthy();
		const skills = schema.properties.skills as Record<string, unknown>;
		expect(skills.uniqueItems).toBe(true);
		expect(skills.minItems).toBe(1);
		expect(Array.isArray((skills.items as Record<string, unknown>).enum)).toBe(true);
	});

	test("all gate schemas are valid JSON Schema objects", () => {
		for (const [key, schema] of Object.entries(gateResultSchemas)) {
			expect(schema.type).toBe("object");
			expect(Array.isArray(schema.required)).toBe(true);
			expect(typeof schema.properties).toBe("object");
			// Every schema must have stage as a const
			const stageProp = schema.properties.stage as Record<string, unknown> | undefined;
			expect(stageProp).toBeTruthy();
			expect(stageProp!.const).toBeTruthy();
		}
	});

	test("integration schema requires tasksMarkedDone", () => {
		const schema = gateResultSchemas.integrate;
		expect(schema.required).toContain("tasksMarkedDone");
	});

	test("finding schema enforces severity enum", () => {
		const schema = gateResultSchemas.review;
		const findingItems = (schema.properties.findings as Record<string, unknown>).items as Record<string, unknown>;
		const severityProp = (findingItems.properties as Record<string, unknown>).severity as Record<string, unknown>;
		expect(severityProp.enum).toEqual(["blocker", "high", "medium", "low"]);
	});

	test("planner schema permits testPlan for E2E/security slices", () => {
		// Regression: additionalProperties:false + testPlan absent from properties
		// made it structurally impossible for the planner to emit testPlan, which
		// forced task-qa GAPS into an endless CLARIFY loop and then human escalation.
		const schema = gateResultSchemas.planner;
		const testPlan = (schema.properties as Record<string, unknown>).testPlan as Record<string, unknown>;
		expect(testPlan).toBeTruthy();
		expect(testPlan.type).toBe("object");
		const required = testPlan.required as string[];
		expect(required).toContain("rationale");
		expect(required).toContain("entries");
		// testPlan stays optional: trivial worker-simple slices may omit it
		expect(schema.required).not.toContain("testPlan");
	});

	test("planner testPlan entries carry criterion + tier intents", () => {
		const schema = gateResultSchemas.planner;
		const testPlan = (schema.properties as Record<string, unknown>).testPlan as {
			properties: { entries: { items: { properties: Record<string, unknown> } } };
		};
		const entryProps = testPlan.properties.entries.items.properties;
		expect(entryProps.criterion).toBeTruthy();
		expect((entryProps.unit as Record<string, unknown>).type).toBe("array");
		expect((entryProps.e2e as Record<string, unknown>).type).toBe("array");
		expect((entryProps.contract as Record<string, unknown>).type).toBe("array");
		expect((entryProps.visual as Record<string, unknown>).type).toBe("array");
	});

	test("task-qa schema permits testPlanVerdict enum", () => {
		const schema = gateResultSchemas.taskQa;
		const verdict = (schema.properties as Record<string, unknown>).testPlanVerdict as Record<string, unknown>;
		expect(verdict).toBeTruthy();
		expect(verdict.enum).toEqual(["SUFFICIENT", "GAPS", "N_A"]);
	});
});

