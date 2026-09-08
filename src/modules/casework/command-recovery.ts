/** A retry replays the exact submitted body, even if the form was edited meanwhile. */
export type PendingCaseCommand = { key: string; body: string }

export function prepareCaseCommand(
	previous: PendingCaseCommand | null,
	body: string,
	newKey: () => string
): PendingCaseCommand {
	return previous ?? { key: newKey(), body }
}

/** These responses prove rejection before application. Server/network uncertainty does not. */
export function canDiscardCaseCommand(status: number, code: string): boolean {
	return (
		[400, 401, 403, 404, 422].includes(status) ||
		(status === 409 &&
			[
				"case_version_conflict",
				"case_evidence_changed",
				"case_not_actionable",
				"decision_reason_not_allowed",
				"case_policy_version_missing",
				"case_decision_pending_review",
				"case_already_assigned",
			].includes(code))
	)
}
