import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial exception lifecycle", () => {
	it("keeps review lifecycle separate from reconciliation", () => {
		const domain = read("src/modules/financial/domain/financial-exception-record.ts")
		const resolveUseCase = read(
			"src/modules/financial/application/use-cases/resolve-financial-exception.ts"
		)
		const required = ["open", "acknowledged", "waiting_external", "resolved", "dismissed"]
		const violations = [
			...required.flatMap((signal) =>
				domain.includes(signal) ? [] : [`missing status ${signal}`]
			),
			domain.includes("reconciled")
				? "financial exception status must not include reconciled"
				: null,
			resolveUseCase.includes("resolved_not_reconciled")
				? null
				: "resolve use-case must document resolved_not_reconciled semantics",
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps exception overlay read-only without automatic reopen", () => {
		const exceptionsRoute = read("src/pages/api/internal/financial/exceptions.ts")
		const violations = [
			exceptionsRoute.includes("persisted_plus_derived_readonly_overlay")
				? null
				: "exceptions route must expose persisted + derived read-only overlay",
			exceptionsRoute.includes("autoBackfill: false")
				? null
				: "exceptions route must not backfill records from GET",
			exceptionsRoute.includes("autoReopen: false")
				? null
				: "exceptions route must not reopen resolved or dismissed records from GET",
		].filter(Boolean)
		expect(violations).toEqual([])
	})
})
