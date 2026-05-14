import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const pagePath = "src/pages/financial/index.astro"

describe("Guardrail: financial review drawer stays evidence-first", () => {
	it("renders lightweight detail fields without dashboard panels", () => {
		const source = read(pagePath)
		const required = [
			"financialReviewDrawer",
			"financialReviewDrawerBody",
			"Booking id",
			"Provider id",
			"Basis",
			"Refund handoff",
			"Evidence references",
			"Resolution note",
		]
		const violations = required.flatMap((signal) =>
			source.includes(signal) ? [] : [`${pagePath}: drawer missing ${signal}`]
		)
		expect(violations).toEqual([])
	})
})
