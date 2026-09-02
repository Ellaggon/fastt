import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("Guardrail: financial booking candidate search", () => {
	it("keeps search provider-scoped, bounded and separate from evidence association", () => {
		const repository = read(
			"src/modules/financial/infrastructure/repositories/FinancialBookingCandidateRepository.ts"
		)
		const endpoint = read("src/pages/api/internal/financial/booking-candidates.ts")
		expect(repository).toContain("eq(Booking.providerId, params.providerId)")
		expect(repository).toContain(".limit(params.limit)")
		expect(repository).toContain("EXISTS (")
		expect(repository).toContain("fastt_search_normalize")
		expect(repository).not.toContain(".leftJoin(BookingLineItem")
		expect(endpoint).toContain("requireFinancialManager")
		expect(endpoint).toContain('"Cache-Control", "private, no-store"')
		expect(endpoint).toContain("searchFinancialBookingCandidates")
	})

	it("uses an accessible remote combobox rather than the visible operations page", () => {
		const drawer = read("src/pages/financial/_client/financial-drawer-sections.ts")
		const events = read("src/pages/financial/_client/financial-workspace-events.ts")
		expect(drawer).toContain('role="combobox"')
		expect(drawer).toContain('role="listbox"')
		expect(drawer).toContain('aria-modal="true"')
		expect(events).toContain("AbortController")
		expect(events).toContain("financial-panel-close")
		expect(events).toContain("updateConfirmState")
		expect(events).toContain("onEvidenceAssociationSearch")
		expect(events).not.toContain("bookingCandidates: state.operationsItems")
	})
})
