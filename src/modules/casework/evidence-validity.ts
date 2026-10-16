/** No universal TTL: only a policy deadline or an evidence expiry can end validity. */
export function evaluateEvidenceValidity(input: {
	reviewedAt: Date | null
	updatedAt?: Date | null
	expiresAt?: Date | null
	policyReviewDueAt?: Date | null
	subjectMatches?: boolean
	policyMatches?: boolean
	now?: Date
}) {
	const now = input.now ?? new Date()
	const validDate = (date: Date | null | undefined) => date && Number.isFinite(date.getTime())
	if (input.subjectMatches === false)
		return {
			status: "reconciliation_needed",
			reason: "La evidencia corresponde a otro sujeto.",
		} as const
	if (input.policyMatches === false)
		return {
			status: "reconciliation_needed",
			reason: "La evidencia requiere evaluación con la política aplicable.",
		} as const
	if (!validDate(input.reviewedAt) || input.reviewedAt! > now)
		return {
			status: "reconciliation_needed",
			reason: "No hay fecha de revisión verificable.",
		} as const
	if (input.expiresAt && !validDate(input.expiresAt))
		return {
			status: "reconciliation_needed",
			reason: "La fecha de vencimiento no es verificable.",
		} as const
	if (input.expiresAt && input.expiresAt <= now)
		return { status: "expired", reason: "La evidencia venció; requiere renovación." } as const
	if (
		input.policyReviewDueAt &&
		(!validDate(input.policyReviewDueAt) || input.policyReviewDueAt <= now)
	)
		return {
			status: "reconciliation_needed",
			reason: "La política requiere una nueva revisión.",
		} as const
	if (validDate(input.updatedAt) && input.updatedAt! > input.reviewedAt!)
		return {
			status: "reconciliation_needed",
			reason: "La fuente cambió después de la revisión; confirma qué versión fue evaluada.",
		} as const
	return {
		status: "current",
		reason: input.expiresAt
			? "Revisión registrada; evidencia dentro de su vencimiento."
			: "Revisión registrada; sin vencimiento explícito. No se infiere caducidad por antigüedad.",
	} as const
}
