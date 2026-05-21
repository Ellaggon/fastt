export type CanonicalRestrictionRead = {
	stopSell?: boolean | null
	minStay?: number | null
	maxStay?: number | null
	cta?: boolean | null
	ctd?: boolean | null
	minLeadTime?: number | null
	maxLeadTime?: number | null
	/**
	 * EffectiveRestriction is now rate-plan-aware. Legacy variant/date rows may still
	 * resolve as compatibility during backfill.
	 */
	scope?: "variant" | "rate_plan" | null
}

export type AvailabilityStopSellCompatibilityRead = {
	availableUnits?: number | null
}

export type ResolvedSearchSellability = {
	stopSell: boolean
	minStay: number | null
	maxStay: number | null
	cta: boolean
	ctd: boolean
	minLeadTime: number | null
	maxLeadTime: number | null
	source: "effective_restriction" | "missing_effective_restriction_compatibility"
	usedMissingEffectiveRestrictionCompatibility: boolean
}

function normalizeOptionalPositiveInteger(value: unknown): number | null {
	if (value == null) return null
	const numberValue = Number(value)
	if (!Number.isFinite(numberValue)) return null
	return Math.max(1, Math.floor(numberValue))
}

export function resolveSearchSellability(params: {
	restrictionRow?: CanonicalRestrictionRead | null
	availabilityRow?: AvailabilityStopSellCompatibilityRead | null
}): ResolvedSearchSellability {
	const restriction = params.restrictionRow ?? null
	if (restriction) {
		return {
			stopSell: Boolean(restriction.stopSell ?? false),
			minStay: normalizeOptionalPositiveInteger(restriction.minStay),
			maxStay: normalizeOptionalPositiveInteger(restriction.maxStay),
			cta: Boolean(restriction.cta ?? false),
			ctd: Boolean(restriction.ctd ?? false),
			minLeadTime: normalizeOptionalPositiveInteger(restriction.minLeadTime),
			maxLeadTime: normalizeOptionalPositiveInteger(restriction.maxLeadTime),
			source: "effective_restriction",
			usedMissingEffectiveRestrictionCompatibility: false,
		}
	}

	return {
		// Absence of an EffectiveRestriction row means no commercial restriction
		// has been materialized for this rate plan/date. Availability remains a
		// physical capacity signal only; do not resurrect legacy inventory-owned
		// stop-sell as a runtime blocker.
		stopSell: false,
		minStay: null,
		maxStay: null,
		cta: false,
		ctd: false,
		minLeadTime: null,
		maxLeadTime: null,
		source: "missing_effective_restriction_compatibility",
		usedMissingEffectiveRestrictionCompatibility: true,
	}
}
