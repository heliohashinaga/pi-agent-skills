import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/**
 * Typed fake ExtensionAPI for devloop tests.
 *
 * Eliminates the `as any` casts that proliferated when the real ExtensionAPI
 * surface was unknown. The fake implements only the seams the devloop commands
 * use: `on`, `registerCommand`, `registerEntryRenderer`, `exec`, `events`,
 * `appendEntry`, and the command context fields passed to handlers.
 *
 * The fake exposes `commands` and `sessionStartHandlers` as public properties
 * so tests can inspect registrations without reaching into private state.
 */

export interface FakeCommand {
	description: string;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
}

export class FakeExtensionApi implements ExtensionAPI {
	readonly commands: Record<string, FakeCommand> = {};
	readonly sessionStartHandlers: Array<(event: "session_start", ctx: ExtensionCommandContext) => void> = [];

	on(event: string, handler: (event: unknown, ctx: unknown) => void): void {
		if (event === "session_start") {
			this.sessionStartHandlers.push(handler as (event: "session_start", ctx: ExtensionCommandContext) => void);
		}
	}

	registerCommand(name: string, cmd: { description?: string; handler: (...args: unknown[]) => unknown }): void {
		this.commands[name] = {
			description: cmd.description ?? "",
			handler: cmd.handler as FakeCommand["handler"],
		};
	}

	registerEntryRenderer(): void {}

	async exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
		if (command === "git" && args[0] === "status" && args[1] === "--porcelain") {
			return { code: 0, stdout: "", stderr: "" };
		}
		return { code: 0, stdout: "", stderr: "" };
	}

	events = {
		emit: () => {},
		on: () => () => {},
	};

	appendEntry(): void {}
}

export interface FakePiCalls {
	notifyCalls: Array<{ message: string; level: "info" | "warning" | "error" }>;
	widgets: Record<string, unknown>;
	editorFactory: { current: unknown };
	commands: Record<string, FakeCommand>;
	sessionStartHandlers: Array<(event: "session_start", ctx: ExtensionCommandContext) => void>;
}

export function fakeExtensionApi(): { pi: FakeExtensionApi; ctx: ExtensionCommandContext } & FakePiCalls {
	const pi = new FakeExtensionApi();
	const notifyCalls: Array<{ message: string; level: "info" | "warning" | "error" }> = [];
	const widgets: Record<string, unknown> = {};
	const editorFactory = { current: null as unknown };

	const ctx: ExtensionCommandContext = {
		cwd: "/test/repo",
		mode: "tui",
		hasUI: true,
		modelRegistry: { getAvailable: () => [] },
		ui: {
			notify: (message, level = "info") => notifyCalls.push({ message, level }),
			setStatus: () => {},
			setWorkingMessage: () => {},
			setWorkingVisible: () => {},
			setWorkingIndicator: () => {},
			setWidget: (key, content) => { widgets[key] = content; },
			clearWidget: (key) => { delete widgets[key]; },
			setTitle: () => {},
			getEditorComponent: () => editorFactory.current,
			setEditorComponent: (factory) => { editorFactory.current = factory; },
			theme: { fg: (_c, t) => t, bold: (t) => t },
		},
	};

	return {
		pi,
		ctx,
		notifyCalls,
		widgets,
		editorFactory,
		commands: pi.commands,
		sessionStartHandlers: pi.sessionStartHandlers,
	};
}
