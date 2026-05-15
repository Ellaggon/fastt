import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: refund handoffs remain provider-scoped", () => {
	it("requires provider auth and provider-scoped repository filters", () => {
		const listRoute = read("src/pages/api/internal/financial/refund-handoffs.ts")
		const acknowledgeRoute = read(
			"src/pages/api/internal/financial/refund-handoffs/[id]/acknowledge.ts"
		)
		const closeRoute = read("src/pages/api/internal/financial/refund-handoffs/[id]/close.ts")
		const dismissRoute = read("src/pages/api/internal/financial/refund-handoffs/[id]/dismiss.ts")
		const repository = read(
			"src/modules/financial/infrastructure/repositories/RefundHandoffRepository.ts"
		)
		const source = `${listRoute}\n${acknowledgeRoute}\n${closeRoute}\n${dismissRoute}\n${repository}`
		const required = [
			"requireFinancialProvider(request)",
			"providerId: auth.providerId",
			"RefundHandoffTable.providerId",
			"findByIdForProvider",
			"findByProvider",
		]
		const violations = required.flatMap((signal) =>
			source.includes(signal) ? [] : [`Refund handoff provider scope missing ${signal}`]
		)
		expect(violations).toEqual([])
	})
})
