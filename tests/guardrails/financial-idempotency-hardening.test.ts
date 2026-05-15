import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial Stage 2 mutations are idempotency-aware", () => {
	it("does not append duplicate review events for repeated acknowledges", () => {
		const exceptionAck = read(
			"src/modules/financial/application/use-cases/acknowledge-financial-exception.ts"
		)
		const handoffAck = read(
			"src/modules/financial/application/use-cases/acknowledge-refund-handoff.ts"
		)
		const violations = [
			exceptionAck.includes('existing.status === "acknowledged"')
				? null
				: "financial exception acknowledge must short-circuit repeated acknowledge",
			handoffAck.includes('existing.status === "acknowledged"')
				? null
				: "refund handoff acknowledge must short-circuit repeated acknowledge",
			exceptionAck.includes("event: null, idempotent: true")
				? null
				: "financial exception acknowledge must return idempotent without event",
			handoffAck.includes("event: null, idempotent: true")
				? null
				: "refund handoff acknowledge must return idempotent without event",
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps reference and handoff creation app-level idempotent", () => {
		const referenceRepo = read(
			"src/modules/financial/infrastructure/repositories/FinancialReferenceRepository.ts"
		)
		const handoffRepo = read(
			"src/modules/financial/infrastructure/repositories/RefundHandoffRepository.ts"
		)
		const violations = [
			referenceRepo.includes("findExisting") && referenceRepo.includes("created: false")
				? null
				: "FinancialReferenceRepository must return existing reference instead of duplicating",
			handoffRepo.includes("findActiveByBookingId") && handoffRepo.includes("created: false")
				? null
				: "RefundHandoffRepository must reuse active handoff instead of duplicating",
			handoffRepo.includes("terminalStatuses.has(existing.status)")
				? null
				: "RefundHandoffRepository must prevent repeated terminal transitions",
		].filter(Boolean)
		expect(violations).toEqual([])
	})
})
