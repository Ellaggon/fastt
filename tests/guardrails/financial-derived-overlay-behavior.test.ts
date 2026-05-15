import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const exceptionsRoute = "src/pages/api/internal/financial/exceptions.ts"
const financialPage = "src/pages/financial/index.astro"

describe("Guardrail: financial derived/persisted overlay remains safe", () => {
	it("keeps derived exceptions visible without creating persisted records from GET", () => {
		const source = read(exceptionsRoute)
		const violations = [
			source.includes('overlaySource: "derived_only"')
				? null
				: `${exceptionsRoute}: missing derived-only overlay fallback`,
			source.includes('overlaySource: "persisted_overlay"')
				? null
				: `${exceptionsRoute}: missing persisted overlay state`,
			source.includes("CLOSED_STATUSES.has(persisted.status)")
				? null
				: `${exceptionsRoute}: terminal persisted records must suppress auto-reopen`,
			source.includes("autoBackfill: false") ? null : `${exceptionsRoute}: GET must not backfill`,
			source.includes("autoReopen: false") ? null : `${exceptionsRoute}: GET must not reopen`,
			source.includes("readOnly: true")
				? null
				: `${exceptionsRoute}: overlay response must declare read-only`,
			source.includes("financialExceptionRepository.create")
				? `${exceptionsRoute}: GET must not create persisted exceptions`
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps UI distinction between persisted, derived-only, and derived-still-present", () => {
		const source = read(financialPage)
		const required = ["derived only", "derived still present", "persisted"]
		const violations = required.flatMap((label) =>
			source.includes(label) ? [] : [`${financialPage}: missing overlay label ${label}`]
		)
		expect(violations).toEqual([])
	})
})
