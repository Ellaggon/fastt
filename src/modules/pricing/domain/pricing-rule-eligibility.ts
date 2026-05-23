export type PricingRuleEligibility = {
	minLeadDays?: number | null
	maxLeadDays?: number | null
	minNights?: number | null
}

export type PricingRuleStayContext = {
	requestDate: Date | string
	checkIn: Date | string
	checkOut?: Date | string | null
	nights?: number | null
}

export type PricingRuleEligibilityResult = {
	applies: boolean
	explanation: string
	reasons: string[]
	leadTimeDays: number | null
	nights: number | null
	missingContext: boolean
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toDateOnly(value: Date | string | null | undefined): Date | null {
	if (!value) return null
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) return null
		return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
	}
	const raw = String(value).trim()
	if (!raw) return null
	const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw)
	if (Number.isNaN(parsed.getTime())) return null
	return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}

function wholeDaysBetween(from: Date, to: Date): number {
	return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY)
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return null
	const normalized = Math.trunc(parsed)
	return normalized > 0 ? normalized : null
}

function normalizeEligibility(
	eligibility?: PricingRuleEligibility | null
): Required<PricingRuleEligibility> {
	return {
		minLeadDays: normalizePositiveInteger(eligibility?.minLeadDays),
		maxLeadDays: normalizePositiveInteger(eligibility?.maxLeadDays),
		minNights: normalizePositiveInteger(eligibility?.minNights),
	}
}

function resolveStayContext(stayContext?: PricingRuleStayContext | null): {
	leadTimeDays: number | null
	nights: number | null
	missingContext: boolean
} {
	if (!stayContext) {
		return { leadTimeDays: null, nights: null, missingContext: true }
	}

	const requestDate = toDateOnly(stayContext.requestDate)
	const checkIn = toDateOnly(stayContext.checkIn)
	const checkOut = toDateOnly(stayContext.checkOut)
	const leadTimeDays = requestDate && checkIn ? wholeDaysBetween(requestDate, checkIn) : null
	const explicitNights = normalizePositiveInteger(stayContext.nights ?? null)
	const derivedNights = checkIn && checkOut ? wholeDaysBetween(checkIn, checkOut) : null
	const nights =
		explicitNights ?? (derivedNights && derivedNights > 0 ? Math.trunc(derivedNights) : null)

	return {
		leadTimeDays,
		nights,
		missingContext: leadTimeDays == null && nights == null,
	}
}

export function hasPricingRuleEligibility(eligibility?: PricingRuleEligibility | null): boolean {
	const normalized = normalizeEligibility(eligibility)
	return Boolean(normalized.minLeadDays || normalized.maxLeadDays || normalized.minNights)
}

export function evaluatePricingRuleEligibility(params: {
	eligibility?: PricingRuleEligibility | null
	stayContext?: PricingRuleStayContext | null
	ruleLabel?: string | null
}): PricingRuleEligibilityResult {
	const eligibility = normalizeEligibility(params.eligibility)
	const { leadTimeDays, nights, missingContext } = resolveStayContext(params.stayContext)
	const reasons: string[] = []
	const failures: string[] = []

	if (eligibility.minLeadDays) {
		if (leadTimeDays == null) {
			failures.push(`booking lead time is unknown; minimum is ${eligibility.minLeadDays} days`)
		} else if (leadTimeDays < eligibility.minLeadDays) {
			failures.push(
				`booking is ${leadTimeDays} days before check-in; minimum is ${eligibility.minLeadDays}`
			)
		} else {
			reasons.push(
				`booking is ${leadTimeDays} days before check-in (minimum ${eligibility.minLeadDays})`
			)
		}
	}

	if (eligibility.maxLeadDays) {
		if (leadTimeDays == null) {
			failures.push(`booking lead time is unknown; maximum is ${eligibility.maxLeadDays} days`)
		} else if (leadTimeDays > eligibility.maxLeadDays) {
			failures.push(
				`booking is ${leadTimeDays} days before check-in; maximum is ${eligibility.maxLeadDays}`
			)
		} else {
			reasons.push(`booking is within ${eligibility.maxLeadDays}-day arrival window`)
		}
	}

	if (eligibility.minNights) {
		if (nights == null) {
			failures.push(`stay length is unknown; minimum is ${eligibility.minNights} nights`)
		} else if (nights < eligibility.minNights) {
			failures.push(`stay length is below ${eligibility.minNights} nights`)
		} else {
			reasons.push(`stay length is ${nights} nights (minimum ${eligibility.minNights})`)
		}
	}

	if (!hasPricingRuleEligibility(eligibility)) {
		return {
			applies: true,
			explanation: "Applied because no pricing eligibility condition is configured.",
			reasons: ["no pricing eligibility condition is configured"],
			leadTimeDays,
			nights,
			missingContext,
		}
	}

	if (failures.length) {
		return {
			applies: false,
			explanation: `Skipped because ${failures.join("; ")}.`,
			reasons: failures,
			leadTimeDays,
			nights,
			missingContext,
		}
	}

	return {
		applies: true,
		explanation: `Applied because ${reasons.join("; ")}.`,
		reasons,
		leadTimeDays,
		nights,
		missingContext,
	}
}

export function formatPricingRuleEligibilityLabel(
	eligibility?: PricingRuleEligibility | null
): string {
	const normalized = normalizeEligibility(eligibility)
	const labels: string[] = []
	if (normalized.minLeadDays) labels.push(`reserva al menos ${normalized.minLeadDays} días antes`)
	if (normalized.maxLeadDays) labels.push(`reserva dentro de ${normalized.maxLeadDays} días`)
	if (normalized.minNights) labels.push(`mínimo ${normalized.minNights} noches`)
	return labels.length ? labels.join(" · ") : "Sin elegibilidad adicional"
}
