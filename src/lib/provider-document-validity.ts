/**
 * Documentary validity is expressed as a civil date, not an instant. A
 * document dated 26 September remains valid throughout that calendar day.
 */
export function isProviderDocumentExpired(expiresAt: Date | null | undefined, at = new Date()) {
	if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) return false
	const startOfToday = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
	return expiresAt.getTime() < startOfToday
}

/** Operational reminder window, not a statutory validity period. */
export function documentRenewalNotice(
	document: { status: string; expiresAt?: Date | null },
	at = new Date()
): { kind: "expired" | "due_soon"; daysRemaining: number } | null {
	const expiry = document.expiresAt
	if (
		document.status !== "verified" ||
		!(expiry instanceof Date) ||
		!Number.isFinite(expiry.getTime())
	)
		return null
	const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
	const daysRemaining = Math.round((day(expiry) - day(at)) / 86_400_000)
	if (daysRemaining < 0) return { kind: "expired", daysRemaining }
	return daysRemaining <= 30 ? { kind: "due_soon", daysRemaining } : null
}
