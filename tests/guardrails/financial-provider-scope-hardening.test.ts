import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const providerScopedRepositories = [
	"src/modules/financial/infrastructure/repositories/FinancialExceptionRepository.ts",
	"src/modules/financial/infrastructure/repositories/FinancialReferenceRepository.ts",
	"src/modules/financial/infrastructure/repositories/FinancialReviewEventRepository.ts",
	"src/modules/financial/infrastructure/repositories/RefundHandoffRepository.ts",
]

describe("Guardrail: financial provider-scoped reads fail closed without provider scope", () => {
	it("keeps Stage 2 provider reads defensive instead of throwing TypeError", () => {
		const violations = providerScopedRepositories.flatMap((file) => {
			const source = read(file)
			const required = [
				"async findByProvider(params?:",
				'const providerId = String(params?.providerId ?? "").trim()',
				"if (!providerId) return []",
			]
			return required.flatMap((signal) =>
				source.includes(signal)
					? []
					: [`${file}: provider-scoped findByProvider is missing fail-closed signal ${signal}`]
			)
		})
		expect(violations).toEqual([])
	})
})
