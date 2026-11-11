import { describe, expect, it } from "vitest"
import { assertDocumentReviewTransition } from "@/lib/documents/review-transition"
const withdrawal = {
	currentStatus: "verified",
	nextStatus: "rejected",
	withdrawVerification: true,
	reviewNotes: "Suspension conocida; revisar el alcance afectado.",
}
describe("explicit withdrawal of document verification", () => {
	it("allows withdrawal with a reason but never reapproval through withdrawal", () => {
		expect(() => assertDocumentReviewTransition(withdrawal)).not.toThrow()
		expect(() => assertDocumentReviewTransition({ ...withdrawal, nextStatus: "verified" })).toThrow(
			"invalid_verification_withdrawal"
		)
	})
	it("requires explicit intent and a substantive reason", () => {
		expect(() =>
			assertDocumentReviewTransition({ ...withdrawal, withdrawVerification: false })
		).toThrow("not_pending")
		expect(() => assertDocumentReviewTransition({ ...withdrawal, reviewNotes: " " })).toThrow(
			"withdrawal_reason_required"
		)
	})
	it.each(["rejected", "superseded"])("does not withdraw %s history", (currentStatus) => {
		expect(() => assertDocumentReviewTransition({ ...withdrawal, currentStatus })).toThrow(
			"not_pending"
		)
	})
	it("preserves ordinary pending review", () => {
		expect(() =>
			assertDocumentReviewTransition({
				...withdrawal,
				currentStatus: "pending",
				withdrawVerification: false,
			})
		).not.toThrow()
	})
})
