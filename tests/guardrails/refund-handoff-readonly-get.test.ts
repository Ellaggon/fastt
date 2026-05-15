import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: refund handoff GET stays read-only", () => {
	it("does not create, sync, update or delete handoffs from GET", () => {
		const route = read("src/pages/api/internal/financial/refund-handoffs.ts")
		const forbidden = [
			/\.insert\s*\(/,
			/\.update\s*\(/,
			/\.delete\s*\(/,
			/createIfAbsent/,
			/\bauto\b/i,
			/\bbackfill\b/i,
			/\bsync\b/i,
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(route) ? [`Refund handoff GET contains side-effect signal ${pattern}`] : []
		)
		expect(violations).toEqual([])
	})
})
