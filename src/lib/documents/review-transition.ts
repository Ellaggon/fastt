/** Only the authorized review command may withdraw a previously verified document. */
export function assertDocumentReviewTransition(input: {
	currentStatus: string
	nextStatus: string
	withdrawVerification: boolean
	reviewNotes: string
}) {
	if (input.withdrawVerification && input.nextStatus !== "rejected")
		throw Object.assign(new Error("invalid_verification_withdrawal"), { status: 400 })
	if (input.currentStatus === "pending") return
	if (input.currentStatus !== "verified" || !input.withdrawVerification)
		throw Object.assign(new Error("not_pending"), { status: 409 })
	if (input.reviewNotes.trim().length < 10)
		throw Object.assign(new Error("withdrawal_reason_required"), { status: 422 })
}
