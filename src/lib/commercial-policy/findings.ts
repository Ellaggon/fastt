import type { CommercialPolicyBlocker } from "./evaluate"

/** Shared explanation classification; never grants a capability. */
export function classifyCommercialFinding(
	blocker: Pick<CommercialPolicyBlocker, "id" | "evidenceState">
) {
	const { id, evidenceState } = blocker
	const category =
		id.startsWith("agreement_") || id === "collection_model_undecided"
			? "agreement"
			: evidenceState || id.startsWith("requirement_")
				? "evidence"
				: /^(policy_context_(unsupported|conflict)|policy_contract_)/.test(id)
					? "configuration"
					: "context"
	const waiting =
		category === "configuration" ||
		evidenceState === "pending_review" ||
		[
			"agreement_proposal_requested",
			"agreement_not_started",
			"holder_declaration_in_review",
		].includes(id)
	return { category, owner: waiting ? "fastt" : "provider", waiting } as const
}
