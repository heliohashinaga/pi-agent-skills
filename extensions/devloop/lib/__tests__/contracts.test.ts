import { describe, expect, test } from "bun:test";

import { gateResultSchemas } from "../contracts";

// ---------------------------------------------------------------------------
// Minimal deterministic JSON-Schema subset validator covering exactly the
// keywords the planner gate schema uses (type, required, additionalProperties,
// const, enum, anyOf, minItems, items, minLength, uniqueItems). It mirrors the
// strictness of the structured_output runtime without adding a validator
// dependency — kept deliberately small.
// ---------------------------------------------------------------------------
type Schema = Record<string, any>;

function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function validate(schema: Schema, value: unknown, path = "$"): string[] {
	const errors: string[] = [];

	if (schema.const !== undefined) {
		if (!deepEqual(schema.const, value)) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
	}
	if (Array.isArray(schema.enum)) {
		if (!schema.enum.some((e: unknown) => deepEqual(e, value))) {
			errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
		}
	}

	if (schema.type === "object" && !(typeof value === "object" && value !== null && !Array.isArray(value))) {
		errors.push(`${path}: expected object`);
	} else if (schema.type === "array" && !Array.isArray(value)) {
		errors.push(`${path}: expected array`);
	} else if (schema.type === "string" && typeof value !== "string") {
		errors.push(`${path}: expected string`);
	}

	// Object-shape constraints apply to any plain-object value, including
	// type-less subschemas such as the anyOf alternatives ({ required: [...] }).
	const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
	if (isPlainObject) {
		const obj = value as Record<string, unknown>;
		for (const prop of schema.required ?? []) {
			if (!(prop in obj)) errors.push(`${path}: must have required properties ${prop}`);
		}
		if (schema.additionalProperties === false) {
			for (const key of Object.keys(obj)) {
				if (!(key in (schema.properties ?? {}))) errors.push(`${path}: must NOT have additional property ${key}`);
			}
		}
		for (const [key, sub] of Object.entries(schema.properties ?? {})) {
			if (key in obj) errors.push(...validate(sub as Schema, obj[key], `${path}.${key}`));
		}
	}

	if (Array.isArray(value)) {
		if ((schema.minItems ?? 0) > value.length) errors.push(`${path}: must have at least ${schema.minItems} items`);
		if (schema.uniqueItems === true && new Set(value).size !== value.length) {
			errors.push(`${path}: must have unique items`);
		}
		for (const item of value) errors.push(...validate(schema.items ?? {}, item, `${path}[]`));
	}

	if (typeof value === "string" && (schema.minLength ?? 0) > value.length) {
		errors.push(`${path}: must have length >= ${schema.minLength}`);
	}

	if (Array.isArray(schema.anyOf)) {
		const failed: string[][] = [];
		let ok = false;
		for (const alt of schema.anyOf) {
			const subErrors = validate(alt as Schema, value, path);
			if (subErrors.length === 0) {
				ok = true;
				break;
			}
			failed.push(subErrors);
		}
		if (!ok) errors.push(`${path}: must match at least one anyOf alternative (${failed.map((f) => f[0]).join(" | ")})`);
	}

	return errors;
}

/** Minimal well-formed planner result (all top-level required fields). */
function plannerBase(): Record<string, unknown> {
	return {
		stage: "planner",
		verdict: "PLANNED",
		startingWorker: "worker-complex",
		skills: ["nextjs", "typescript"],
		summary: "A scoped slice.",
		acceptanceCriteria: ["An acceptance criterion."],
		docsNeeded: false,
	};
}

describe("planner gate schema — testPlan entry tolerance (T024 regression)", () => {
	test("contract-only entry without `unit` validates (the exact T024 failure payload)", () => {
		// Run mskb7bis failed with `value.testPlan.entries.5.unit: must have
		// required properties unit` because entry[5] carried criterion + contract
		// but no unit. With `unit` optional, this shape must now pass.
		const value = {
			...plannerBase(),
			testPlan: {
				rationale: "Regression entry covered at the contract tier.",
				entries: [
					{
						criterion: "All existing tests continue to pass without change",
						contract: ["provider pipeline integration tests stay green"],
					},
				],
			},
		};
		expect(validate(gateResultSchemas.planner, value)).toEqual([]);
	});

	test("an entry still needs at least one test tier (criterion-only is rejected)", () => {
		const value = {
			...plannerBase(),
			testPlan: {
				rationale: "Empty entry must not validate.",
				entries: [{ criterion: "No tier populated." }],
			},
		};
		const errors = validate(gateResultSchemas.planner, value);
		expect(errors.some((e) => e.includes("anyOf"))).toBe(true);
	});

	test("unit-only and mixed-tier entries still validate (backward compatibility)", () => {
		const unitOnly = {
			...plannerBase(),
			testPlan: {
				rationale: "Unit coverage.",
				entries: [{ criterion: "C", unit: ["u1"] }],
			},
		};
		const mixed = {
			...plannerBase(),
			testPlan: {
				rationale: "Mixed coverage.",
				entries: [{ criterion: "C", unit: ["u1"], contract: ["c1"], e2e: ["e1"], visual: ["v1"] }],
			},
		};
		expect(validate(gateResultSchemas.planner, unitOnly)).toEqual([]);
		expect(validate(gateResultSchemas.planner, mixed)).toEqual([]);
	});

	test("empty tier arrays are rejected (minItems 1 on every tier)", () => {
		const value = {
			...plannerBase(),
			testPlan: {
				rationale: "Empty arrays must not count as tiers.",
				entries: [{ criterion: "C", contract: [] }],
			},
		};
		const errors = validate(gateResultSchemas.planner, value);
		expect(errors.some((e) => e.includes("at least 1"))).toBe(true);
	});

	test("schema structure: unit no longer required, anyOf enforces one tier, additionalProperties still forbidden", () => {
		const items = (gateResultSchemas.planner as Record<string, any>).properties?.testPlan?.properties?.entries?.items;
		expect(items.required).toEqual(["criterion"]);
		expect(items.anyOf).toEqual([{ required: ["unit"] }, { required: ["contract"] }, { required: ["e2e"] }, { required: ["visual"] }]);
		for (const tier of ["unit", "contract", "e2e", "visual"]) {
			expect(items.properties[tier].minItems).toBe(1);
		}
		expect(items.additionalProperties).toBe(false);
		expect(items.properties.criterion.minLength).toBe(1);
	});
});