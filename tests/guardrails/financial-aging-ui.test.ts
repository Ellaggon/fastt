import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const pagePath = "src/pages/financial/index.astro"

describe("Guardrail: financial aging UI is honest", () => {
	it("uses persisted openedAt first and booking confirmation only as derived fallback", () => {
		const source = read(pagePath)
		const required = [
			"item?.openedAt || item?.workflow?.openedAt",
			"booking confirmed",
			"confirmedAt",
		]
		const forbidden = [/SLA breached/i, /overdue/i, /escalation engine/i]
		const violations = [
			...required.flatMap((signal) =>
				source.includes(signal) ? [] : [`${pagePath}: missing aging signal ${signal}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`${pagePath}: fake aging semantics ${pattern}`] : []
			),
		]
		expect(violations).toEqual([])
	})
})
