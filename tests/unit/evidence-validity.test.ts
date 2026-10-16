import { describe, expect, it } from "vitest"
import { evaluateEvidenceValidity } from "@/modules/casework/evidence-validity"
import { parseReviewDate } from "@/lib/provider-review-date"
const now = new Date("2026-10-15T12:00:00Z")
const reviewedAt = new Date("2025-01-01T12:00:00Z")
describe("evidence validity contract", () => {
	it("never invents a universal age limit", () =>
		expect(evaluateEvidenceValidity({ reviewedAt, now }).status).toBe("current"))
	it("does not mistake an update timestamp for a review", () =>
		expect(evaluateEvidenceValidity({ reviewedAt: null, updatedAt: now, now }).status).toBe(
			"reconciliation_needed"
		))
	it("requires reconciliation after a source changed", () =>
		expect(evaluateEvidenceValidity({ reviewedAt, updatedAt: now, now }).status).toBe(
			"reconciliation_needed"
		))
	it("uses the explicit document expiry including its boundary", () =>
		expect(evaluateEvidenceValidity({ reviewedAt, expiresAt: now, now }).status).toBe("expired"))
	it("honors the subject and policy rather than just the date", () => {
		expect(evaluateEvidenceValidity({ reviewedAt, now, subjectMatches: false }).status).toBe(
			"reconciliation_needed"
		)
		expect(evaluateEvidenceValidity({ reviewedAt, now, policyMatches: false }).status).toBe(
			"reconciliation_needed"
		)
		expect(evaluateEvidenceValidity({ reviewedAt, now, policyReviewDueAt: now }).status).toBe(
			"reconciliation_needed"
		)
	})
	it("rejects invalid or future reviews", () => {
		expect(evaluateEvidenceValidity({ reviewedAt: new Date("invalid"), now }).status).toBe(
			"reconciliation_needed"
		)
		expect(evaluateEvidenceValidity({ reviewedAt: new Date(now.getTime() + 1), now }).status).toBe(
			"reconciliation_needed"
		)
	})
	it("extracts only the recorded review date", () => {
		expect(parseReviewDate({ updatedAt: now.toISOString() })).toBeNull()
		expect(parseReviewDate({ lastReview: { reviewedAt: "bad" } })).toBeNull()
		expect(parseReviewDate({ lastReview: { reviewedAt: reviewedAt.toISOString() } })).toEqual(
			reviewedAt
		)
	})
})
