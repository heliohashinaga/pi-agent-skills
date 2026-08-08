export type WorkerName = "worker-simple" | "worker-complex";

export type PipelineStage =
	| "planner"
	| "task-qa"
	| "code"
	| "review"
	| "test"
	| "security"
	| "security-deep"
	| "documentation"
	| "integrate"
	| "ready-to-merge"
	| "human-escalation";

export type FindingSeverity = "blocker" | "high" | "medium" | "low";

/** The 13 installed skills, kept as a closed allowlist for the planner. */
export const ALLOWED_SKILLS = [
	"design-system",
	"docs",
	"dotnet",
	"gitmoji",
	"java",
	"multi-agent-orchestration",
	"nextjs",
	"orchestration-advisor",
	"python",
	"rust",
	"security",
	"typescript",
	"vuejs",
] as const;

export type AllowedSkill = (typeof ALLOWED_SKILLS)[number];

export interface Finding {
	severity: FindingSeverity;
	message: string;
	file?: string;
	line?: number;
	suggestedFix?: string;
}

/**
 * Test coverage guidance the planner designs (against acceptance criteria) and
 * that `task-qa` validates. Authored by the read-only planner; the worker
 * authors the actual test files against it; the tester verifies it was fulfilled.
 */
export interface TestPlanEntry {
	/** Acceptance criterion this entry covers (traceability to acceptanceCriteria). */
	criterion: string;
	/** Unit test intents (Vitest). Optional when another tier (e.g. contract) applies. */
	unit?: string[];
	/** API-contract / integration intents (route + pipeline vs OpenAPI). */
	contract?: string[];
	/** Playwright user journeys (e.g. pt-BR + en). */
	e2e?: string[];
	/** Storybook stories (default/edge/error) + a11y checks. */
	visual?: string[];
}

export interface TestPlan {
	/** Short justification, or "n/a — trivial worker-simple slice". */
	rationale: string;
	entries: TestPlanEntry[];
}

export interface PlannedSliceResult {
	stage: "planner";
	verdict: "PLANNED";
	startingWorker: WorkerName;
	/** Required non-empty array of skills from the closed allowlist. */
	skills: AllowedSkill[];
	summary: string;
	acceptanceCriteria: string[];
	docsNeeded: boolean;
	/**
	 * Optional test coverage design. Expected (non-empty) for worker-complex or
	 * E2E/visual/security-sensitive slices; lean (or omitted) for trivial
	 * worker-simple slices. `task-qa` validates sufficiency.
	 */
	testPlan?: TestPlan;
}

export interface TaskQaResult {
	stage: "task-qa";
	verdict: "READY" | "CLARIFY_NEEDED";
	summary: string;
	corrections: string[];
	/**
	 * Optional QA verdict on the planner's testPlan (for observability/tests):
	 * SUFFICIENT | GAPS | N_A. GAPS routes CLARIFY_NEEDED back to the planner.
	 */
	testPlanVerdict?: "SUFFICIENT" | "GAPS" | "N_A";
}

export interface CodeResult {
	stage: "code";
	verdict: "IMPLEMENTED" | "ESCALATE" | "HUMAN_ESCALATION";
	summary: string;
	changedFiles?: string[];
	commandsRun?: string[];
}

export interface ReviewResult {
	stage: "review";
	verdict: "APPROVED" | "CHANGES_REQUESTED" | "HUMAN_ESCALATION";
	route?: WorkerName | "human";
	escalateToComplex?: boolean;
	summary: string;
	findings: Finding[];
}

export interface TestResult {
	stage: "test";
	verdict: "MEETS_TASK" | "PARTIAL" | "DOES_NOT_MEET" | "HUMAN_ESCALATION";
	route?: WorkerName | "human";
	escalateToComplex?: boolean;
	summary: string;
	findings: Finding[];
}

export interface SecurityTriageResult {
	stage: "security";
	verdict: "LOW_RISK" | "NEEDS_DEEP_REVIEW" | "HUMAN_ESCALATION";
	summary: string;
	securitySensitive: boolean;
	triggers: string[];
}

export interface SecurityResult {
	stage: "security-deep";
	verdict: "SECURE" | "SECURITY_CHANGES_REQUESTED" | "HUMAN_ESCALATION";
	route?: "worker-complex" | "human";
	summary: string;
	findings: Finding[];
}

export interface DocumentationResult {
	stage: "documentation";
	verdict: "DOCUMENTED" | "NOT_NEEDED" | "HUMAN_ESCALATION";
	summary: string;
	changedFiles?: string[];
}

export interface IntegrateResult {
	stage: "integrate";
	verdict: "INTEGRATED" | "HUMAN_ESCALATION";
	summary: string;
	branch: string;
	verification: string[];
	tasksMarkedDone: string[];
	prOpened: boolean;
	merged: false;
	prUrl?: string;
}

export type GateResult =
	| PlannedSliceResult
	| TaskQaResult
	| CodeResult
	| ReviewResult
	| TestResult
	| SecurityTriageResult
	| SecurityResult
	| DocumentationResult
	| IntegrateResult;

/**
 * The stage keys a controller dispatches a gate agent for. Derived from
 * PipelineStage by excluding the terminal stages, so the dispatch table can
 * never drift from the routing stages.
 */
export type GateStage = Exclude<PipelineStage, "ready-to-merge" | "human-escalation">;

const findingProperties = {
	severity: { type: "string", enum: ["blocker", "high", "medium", "low"] },
	message: { type: "string", minLength: 1 },
	file: { type: "string", minLength: 1 },
	line: { type: "integer", minimum: 1 },
	suggestedFix: { type: "string", minLength: 1 },
} as const;

const findingSchema = {
	type: "object",
	additionalProperties: false,
	required: ["severity", "message"],
	properties: findingProperties,
} as const;

const summaryProperty = { type: "string", minLength: 1 } as const;

const testPlanTier = { type: "array", minItems: 1, items: summaryProperty } as const;

const testPlanEntrySchema = {
	type: "object",
	additionalProperties: false,
	required: ["criterion"],
	properties: {
		criterion: summaryProperty,
		unit: testPlanTier,
		contract: testPlanTier,
		e2e: testPlanTier,
		visual: testPlanTier,
	},
	// At least one test tier must be populated — an entry cannot be empty. A
	// regression/contract-only entry (no `unit`) is valid as long as it carries
	// another tier (e.g. contract), so a planner omitting `unit` on such an entry
	// no longer rejects the whole structured output.
	anyOf: [{ required: ["unit"] }, { required: ["contract"] }, { required: ["e2e"] }, { required: ["visual"] }],
} as const;

const testPlanSchema = {
	type: "object",
	additionalProperties: false,
	required: ["rationale", "entries"],
	properties: {
		rationale: summaryProperty,
		entries: { type: "array", minItems: 1, items: testPlanEntrySchema },
	},
} as const;

export const gateResultSchemas = {
	planner: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "startingWorker", "skills", "summary", "acceptanceCriteria", "docsNeeded"],
		properties: {
			stage: { const: "planner" },
			verdict: { const: "PLANNED" },
			startingWorker: { enum: ["worker-simple", "worker-complex"] },
			skills: {
				type: "array",
				minItems: 1,
				uniqueItems: true,
				items: { enum: [...ALLOWED_SKILLS] },
			},
			summary: summaryProperty,
			acceptanceCriteria: { type: "array", minItems: 1, items: summaryProperty },
			docsNeeded: { type: "boolean" },
			testPlan: testPlanSchema,
		},
	},
	taskQa: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary", "corrections"],
		properties: {
			stage: { const: "task-qa" },
			verdict: { enum: ["READY", "CLARIFY_NEEDED"] },
			summary: summaryProperty,
			corrections: { type: "array", items: summaryProperty },
			testPlanVerdict: { enum: ["SUFFICIENT", "GAPS", "N_A"] },
		},
	},
	code: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary"],
		properties: {
			stage: { const: "code" },
			verdict: { enum: ["IMPLEMENTED", "ESCALATE", "HUMAN_ESCALATION"] },
			summary: summaryProperty,
			changedFiles: { type: "array", items: { type: "string", minLength: 1 } },
			commandsRun: { type: "array", items: { type: "string", minLength: 1 } },
		},
	},
	review: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary", "findings"],
		properties: {
			stage: { const: "review" },
			verdict: { enum: ["APPROVED", "CHANGES_REQUESTED", "HUMAN_ESCALATION"] },
			route: { enum: ["worker-simple", "worker-complex", "human"] },
			escalateToComplex: { type: "boolean" },
			summary: summaryProperty,
			findings: { type: "array", items: findingSchema },
		},
	},
	test: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary", "findings"],
		properties: {
			stage: { const: "test" },
			verdict: { enum: ["MEETS_TASK", "PARTIAL", "DOES_NOT_MEET", "HUMAN_ESCALATION"] },
			route: { enum: ["worker-simple", "worker-complex", "human"] },
			escalateToComplex: { type: "boolean" },
			summary: summaryProperty,
			findings: { type: "array", items: findingSchema },
		},
	},
	security: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary", "securitySensitive", "triggers"],
		properties: {
			stage: { const: "security" },
			verdict: { enum: ["LOW_RISK", "NEEDS_DEEP_REVIEW", "HUMAN_ESCALATION"] },
			summary: summaryProperty,
			securitySensitive: { type: "boolean" },
			triggers: { type: "array", items: { type: "string", minLength: 1 } },
		},
		allOf: [
			{
				if: { properties: { verdict: { const: "LOW_RISK" } }, required: ["verdict"] },
				then: {
					properties: {
						securitySensitive: { const: false },
						triggers: { maxItems: 0 },
					},
				},
			},
		],
	},
	"security-deep": {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary", "findings"],
		properties: {
			stage: { const: "security-deep" },
			verdict: { enum: ["SECURE", "SECURITY_CHANGES_REQUESTED", "HUMAN_ESCALATION"] },
			route: { enum: ["worker-complex", "human"] },
			summary: summaryProperty,
			findings: { type: "array", items: findingSchema },
		},
	},
	documentation: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary"],
		properties: {
			stage: { const: "documentation" },
			verdict: { enum: ["DOCUMENTED", "NOT_NEEDED", "HUMAN_ESCALATION"] },
			summary: summaryProperty,
			changedFiles: { type: "array", items: { type: "string", minLength: 1 } },
		},
	},
	integrate: {
		type: "object",
		additionalProperties: false,
		required: ["stage", "verdict", "summary", "branch", "verification", "tasksMarkedDone", "prOpened", "merged"],
		properties: {
			stage: { const: "integrate" },
			verdict: { enum: ["INTEGRATED", "HUMAN_ESCALATION"] },
			summary: summaryProperty,
			branch: { type: "string", minLength: 1 },
			verification: { type: "array", minItems: 1, items: summaryProperty },
			prUrl: { type: "string", minLength: 1 },
			prOpened: { type: "boolean" },
			merged: { const: false },
			tasksMarkedDone: { type: "array", items: summaryProperty },
		},
	},
} as const;
