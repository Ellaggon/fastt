import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const pagePath = "src/pages/financial/index.astro"
const eventDomainPath = "src/modules/financial/domain/financial-review-event.ts"

describe("Guardrail: financial timeline remains review-audit only", () => {
	it("uses review events as a minimal timeline, not event sourcing UI", () => {
		const source = `${read(pagePath)}\n${read(eventDomainPath)}`
		const required = [
			"Timeline",
			"exception_acknowledged",
			"exception_resolved",
			"exception_dismissed",
			"reference_added",
			"refund_handoff_acknowledged",
		]
		const forbidden = [/replay/i, /event sourcing/i, /orchestration/i]
		const violations = [
			...required.flatMap((signal) => (source.includes(signal) ? [] : [`missing ${signal}`])),
			...forbidden.flatMap((pattern) =>
				pattern.test(read(pagePath)) ? [`${pagePath}: forbidden timeline theater ${pattern}`] : []
			),
		]
		expect(violations).toEqual([])
	})
})
