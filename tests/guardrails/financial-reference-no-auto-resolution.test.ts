import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: recording financial evidence does not auto-resolve reviews", () => {
	it("records reference audit events without resolving or reconciling exceptions", () => {
		const useCase = read(
			"src/modules/financial/application/use-cases/record-financial-reference.ts"
		)
		const route = read("src/pages/api/internal/financial/references.ts")
		const required = ["reference_added", "linkedExceptionId", "FinancialReviewEventRepositoryPort"]
		const forbidden = [
			/resolveFinancialException/,
			/exception_resolved/,
			/status:\s*["']resolved["']/,
			/reconciled/,
			/settled/,
			/paid/,
		]
		const source = `${useCase}\n${route}`
		const violations = [
			...required.flatMap((signal) =>
				source.includes(signal) ? [] : [`Reference recording missing audit signal ${signal}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(source)
					? [`Reference recording suggests terminal finance state ${pattern}`]
					: []
			),
		]
		expect(violations).toEqual([])
	})
})
