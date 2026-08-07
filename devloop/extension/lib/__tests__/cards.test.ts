import { describe, expect, test } from "bun:test";

import { formatMs, renderGateCard, renderRetroCard, type GateCardData, type RetroCardData } from "../cards";
import type { PanelTheme } from "../panel";

const theme: PanelTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	bold: (text: string) => `*${text}*`,
};

function textOf(component: unknown): string {
	return JSON.stringify(component);
}

describe("devloop gate cards", () => {
	test("formatMs formats ms and seconds", () => {
		expect(formatMs(421)).toBe("421ms");
		expect(formatMs(1200)).toBe("1.2s");
		expect(formatMs(undefined)).toBe("");
		expect(formatMs(0)).toBe("0ms");
	});

	test("renderGateCard produces a header container in collapsed mode", () => {
		const data: GateCardData = {
			unit: "T009",
			stage: "review",
			agent: "reviewer-simple",
			verdict: "APPROVED",
			summary: "looks good",
			findings: [{ severity: "low", message: "nit", file: "a.ts" }],
			tokens: 1200,
			durationMs: 3400,
			toolCount: 5,
		};
		const component = renderGateCard(data, false, theme);
		const rendered = textOf(component);
		expect(rendered).toContain("APPROVED");
		expect(rendered).toContain("reviewer-simple");
		// collapsed mode should not render findings/meta
		expect(rendered).not.toContain("nit");
		expect(rendered).not.toContain("3400");
	});

	test("renderGateCard expands to include summary, findings, files and meta", () => {
		const data: GateCardData = {
			unit: "T009",
			stage: "security",
			agent: "security-triage",
			verdict: "SECURE",
			summary: "no issues",
			findings: [
				{ severity: "blocker", message: "auth bypass", file: "auth.ts" },
				{ severity: "high", message: "xss", file: "view.ts" },
			],
			changedFiles: ["auth.ts", "view.ts"],
			tokens: 500,
			durationMs: 900,
			toolCount: 3,
		};
		const rendered = textOf(renderGateCard(data, true, theme));
		expect(rendered).toContain("auth bypass"); // blocker finding present
		expect(rendered).toContain("xss");
		expect(rendered).toContain("files: auth.ts, view.ts");
		expect(rendered).toContain("500 tok");
		expect(rendered).toContain("900ms");
		expect(rendered).toContain("3 tool calls");
	});

	test("renderGateCard surfaces an error state", () => {
		const data: GateCardData = { unit: "T009", stage: "security", agent: "security-triage", error: "delegate crashed" };
		const rendered = textOf(renderGateCard(data, true, theme));
		expect(rendered).toContain("delegate crashed");
		expect(rendered).toContain("<error>✗</error>");
	});
});

describe("devloop retro cards", () => {
	const data: RetroCardData = {
		runId: "r-1",
		label: "T009",
		status: "human-escalation",
		reason: "security delegate crashed",
		totalTokens: 4200,
		totalToolCalls: 22,
		totalDurationMs: 840_000,
		retries: 3,
		escalations: 2,
		stageCount: 6,
	};

	test("collapsed mode renders header + status, no details", () => {
		const rendered = textOf(renderRetroCard(data, false, theme));
		expect(rendered).toContain("retro");
		expect(rendered).toContain("T009");
		expect(rendered).toContain("human-escalation");
		expect(rendered).not.toContain("retries");
	});

	test("expanded mode includes reason + aggregate meta, and flags escalation icon", () => {
		const rendered = textOf(renderRetroCard(data, true, theme));
		expect(rendered).toContain("security delegate crashed");
		expect(rendered).toContain("6 stages");
		expect(rendered).toContain("4200 tok");
		expect(rendered).toContain("22 tool calls");
		expect(rendered).toContain("retries 3");
		expect(rendered).toContain("escalations 2");
		expect(rendered).toContain("<error>✗</error>"); // escalation renders as error icon
	});
});
