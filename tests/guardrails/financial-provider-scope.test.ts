import { describe, expect, it } from "vitest"

import { financialSourceFiles, read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial internal endpoints are provider scoped", () => {
	it("requires auth provider helper in financial endpoint files", () => {
		const endpoints = financialSourceFiles.filter(
			(file) => file.startsWith("src/pages/api/internal/financial/") && !file.endsWith("_stage2.ts")
		)
		const violations = endpoints.flatMap((file) => {
			const source = read(file)
			if (!source.includes("export const")) return []
			return source.includes("requireFinancialProvider") ||
				source.includes("getProviderIdFromRequest")
				? []
				: [`${file}: missing provider scoping`]
		})
		expect(violations).toEqual([])
	})
})
