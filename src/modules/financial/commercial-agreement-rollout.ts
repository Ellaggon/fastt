export type CommercialAgreementMode = "off" | "prepare" | "enforce"

/** Deployment is not approval. Only an explicitly approved provider cohort can opt in. */
export function commercialAgreementRollout(
	providerId?: string,
	env: Record<string, string | undefined> = process.env
) {
	const requested = env.FASTT_TOUR_AGREEMENT_MODE
	const mode: CommercialAgreementMode =
		requested === "prepare" || requested === "enforce" ? requested : "off"
	const approvalReference = (env.FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE ?? "").trim()
	const providerIds = [
		...new Set(
			(env.FASTT_TOUR_AGREEMENT_PROVIDER_IDS ?? "")
				.split(",")
				.map((id) => id.trim())
				.filter(Boolean)
		),
	]
	const approved = Boolean(approvalReference && providerIds.length && !providerIds.includes("*"))
	const enabled =
		mode !== "off" && approved && (providerId === undefined || providerIds.includes(providerId))
	return { enabled, enforce: enabled && mode === "enforce", mode, providerIds, approvalReference }
}

/** Legacy holds finish under their original snapshot and existing expiry, without retroactive terms. */
export function revalidateTourAgreement(providerId: string, hasAgreementSnapshot: boolean) {
	return hasAgreementSnapshot && commercialAgreementRollout(providerId).enforce
}
