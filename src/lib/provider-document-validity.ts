/**
 * Documentary validity is expressed as a civil date, not an instant. A
 * document dated 26 September remains valid throughout that calendar day.
 */
export function isProviderDocumentExpired(expiresAt: Date | null | undefined, at = new Date()) {
	if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) return false
	const startOfToday = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
	return expiresAt.getTime() < startOfToday
}
