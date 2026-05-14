import { describe, expect, it } from "vitest"

import { financialSourceWithoutTests } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial Stage 2 write boundaries", () => {
	it("allows writes only to Stage 2 financial workflow tables and shadow records", () => {
		const source = financialSourceWithoutTests()
		const forbiddenWrites = [
			/\.insert\s*\(\s*Booking\b/,
			/\.update\s*\(\s*Booking\b/,
			/\.delete\s*\(\s*Booking\b/,
			/\.insert\s*\(\s*BookingRoomDetail\b/,
			/\.update\s*\(\s*BookingRoomDetail\b/,
			/\.insert\s*\(\s*BookingTaxFee\b/,
			/\.update\s*\(\s*BookingTaxFee\b/,
			/\.insert\s*\(\s*Payment\b/,
			/\.update\s*\(\s*Payment\b/,
			/\.insert\s*\(\s*ProviderPayout\b/,
			/\.update\s*\(\s*ProviderPayout\b/,
		]
		const violations = forbiddenWrites.flatMap((pattern) =>
			pattern.test(source) ? [`Financial Stage 2 source writes forbidden table ${pattern}`] : []
		)
		expect(violations).toEqual([])
	})
})
