import { describe, expect, it } from "vitest"

import {
	assertSeparationOfDuties,
	principalHasPermission,
	type InternalPrincipal,
} from "@/lib/auth/internal-authorization"

function principal(grants: InternalPrincipal["grants"]): InternalPrincipal {
	return {
		user: { id: "internal-user", email: "internal@example.test" },
		mode: "iam",
		roles: [...new Set(grants.map((grant) => grant.roleKey))],
		grants,
	}
}

describe("internal authorization segregation", () => {
	it("does not let a fiscal reviewer decide a payout", () => {
		const fiscalReviewer = principal([
			{
				permission: "provider.fiscal.review",
				roleKey: "fiscal_reviewer",
				scopeType: "global",
				scopeId: null,
			},
		])

		expect(principalHasPermission(fiscalReviewer, "provider.fiscal.review")).toBe(true)
		expect(principalHasPermission(fiscalReviewer, "provider.payment.review")).toBe(false)
		expect(principalHasPermission(fiscalReviewer, "payout.release")).toBe(false)
	})

	it("keeps an auditor read-only", () => {
		const auditor = principal([
			{
				permission: "audit.read",
				roleKey: "auditor",
				scopeType: "global",
				scopeId: null,
			},
		])

		expect(principalHasPermission(auditor, "audit.read")).toBe(true)
		expect(principalHasPermission(auditor, "provider.document.review")).toBe(false)
		expect(principalHasPermission(auditor, "case.decision.propose")).toBe(false)
	})

	it("enforces maker and checker as different identities", () => {
		expect(() =>
			assertSeparationOfDuties({ makerUserId: "user-a", checkerUserId: "user-a" })
		).toThrow("maker_checker_separation_required")
		expect(() =>
			assertSeparationOfDuties({ makerUserId: "user-a", checkerUserId: "user-b" })
		).not.toThrow()
	})

	it("honors a provider-scoped grant only within its provider", () => {
		const reviewer = principal([
			{
				permission: "provider.document.review",
				roleKey: "case_agent",
				scopeType: "provider",
				scopeId: "provider-a",
			},
		])

		expect(
			principalHasPermission(reviewer, "provider.document.review", {
				type: "provider",
				id: "provider-a",
			})
		).toBe(true)
		expect(
			principalHasPermission(reviewer, "provider.document.review", {
				type: "provider",
				id: "provider-b",
			})
		).toBe(false)
	})
})
