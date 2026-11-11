import { describe, expect, it } from "vitest"
import { documentRenewalNotice } from "@/lib/provider-document-validity"
const at = new Date("2026-11-08T23:59:59Z")
describe("in-app document renewal reminders", () => {
	it.each([0, 1, 7, 30])("offers renewal %i civil days before expiry", (days) => {
		const expiresAt = new Date(Date.UTC(2026, 10, 8 + days))
		expect(documentRenewalNotice({ status: "verified", expiresAt }, at)).toEqual({
			kind: "due_soon",
			daysRemaining: days,
		})
	})
	it("keeps the expiry day valid and marks the next day expired", () => {
		expect(
			documentRenewalNotice({ status: "verified", expiresAt: new Date("2026-11-07") }, at)?.kind
		).toBe("expired")
	})
	it("does not remind for distant, missing or invalid dates or nonverified evidence", () => {
		for (const expiresAt of [new Date("2026-12-09"), null, new Date("invalid")])
			expect(documentRenewalNotice({ status: "verified", expiresAt }, at)).toBeNull()
		for (const status of ["pending", "rejected", "superseded"])
			expect(documentRenewalNotice({ status, expiresAt: new Date("2026-11-09") }, at)).toBeNull()
	})
})
