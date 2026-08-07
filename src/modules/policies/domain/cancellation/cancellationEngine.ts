export interface CancellationTierModel {
	daysBeforeArrival: number
	/** When set, this hour-based cutoff prevails over daysBeforeArrival for this tier. */
	hoursBeforeDeparture?: number | null
	penaltyType: "percentage" | "fixed" | "nights"
	penaltyAmount?: number
}

function toDate(value: string | Date): Date {
	return value instanceof Date ? value : new Date(value)
}

/** Effective lead-time in hours for sorting / matching. */
export function tierLeadHours(tier: CancellationTierModel): number {
	if (tier.hoursBeforeDeparture != null && Number.isFinite(Number(tier.hoursBeforeDeparture))) {
		return Math.max(0, Number(tier.hoursBeforeDeparture))
	}
	return Math.max(0, Number(tier.daysBeforeArrival ?? 0)) * 24
}

export function calculateCancellationPenalty(
	tiers: CancellationTierModel[],
	arrivalDate: string | Date,
	cancelDate: string | Date,
	totalAmount: number
): number {
	const arrival = toDate(arrivalDate)
	const cancel = toDate(cancelDate)
	const diffMs = arrival.getTime() - cancel.getTime()
	const diffHours = diffMs / (1000 * 60 * 60)
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

	const sorted = [...tiers].sort((a, b) => tierLeadHours(a) - tierLeadHours(b))

	let applied: CancellationTierModel | null = null

	for (const tier of sorted) {
		const usesHours =
			tier.hoursBeforeDeparture != null && Number.isFinite(Number(tier.hoursBeforeDeparture))
		if (usesHours) {
			if (diffHours <= Number(tier.hoursBeforeDeparture)) {
				applied = tier
			}
		} else if (diffDays <= tier.daysBeforeArrival) {
			applied = tier
		}
	}

	if (!applied) return 0

	if (applied.penaltyType === "percentage") {
		return (totalAmount * (applied.penaltyAmount ?? 0)) / 100
	}

	return applied.penaltyAmount ?? 0
}
