import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial Stage 2 aging semantics", () => {
	it("uses openedAt for persisted workflow aging", () => {
		const dbConfig = read("db/config.ts")
		const domain = read("src/modules/financial/domain/financial-exception-record.ts")
		const handoff = read("src/modules/financial/domain/refund-handoff-record.ts")
		const violations = [
			dbConfig.includes("openedAt: column.date()") ? null : "Stage 2 tables must include openedAt",
			domain.includes("openedAt: Date") ? null : "FinancialExceptionRecord must expose openedAt",
			handoff.includes("openedAt: Date") ? null : "RefundHandoffRecord must expose openedAt",
		].filter(Boolean)
		expect(violations).toEqual([])
	})
})
