import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const pagePath = "src/pages/financial/index.astro"

describe("Guardrail: financial UI consumes persisted review workflow", () => {
	it("loads persisted exceptions and review events without replacing the derived queue", () => {
		const source = read(pagePath)
		const required = [
			"/api/internal/financial/exceptions?status=all&limit=250",
			"/api/internal/financial/review-events?limit=250",
			"/api/internal/financial/operations",
			"persisted_overlay",
			"derived_only",
			"derived still present",
			"item?.operation?.operationalException?.all",
		]
		const violations = required.flatMap((signal) =>
			source.includes(signal) ? [] : [`${pagePath}: missing ${signal}`]
		)
		expect(violations).toEqual([])
	})

	it("exposes only lightweight review actions", () => {
		const source = read(pagePath)
		const required = [
			'data-review-action="acknowledge"',
			'data-review-action="resolve"',
			'data-review-action="dismiss"',
			"Resolve review",
			"Resolved means operational review closed",
		]
		const violations = required.flatMap((signal) =>
			source.includes(signal) ? [] : [`${pagePath}: missing ${signal}`]
		)
		expect(violations).toEqual([])
	})
})
