const NON_BACKFILL_REASONS = new Set(["no_active_units", "invalid_stay_range"])

export function shouldTriggerSearchAutoBackfill(reason: string | null | undefined): boolean {
	const normalized = String(reason ?? "").trim()
	if (!normalized) return false
	return !NON_BACKFILL_REASONS.has(normalized)
}
