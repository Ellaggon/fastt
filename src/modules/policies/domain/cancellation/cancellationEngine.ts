export interface CancellationTierModel {
	daysBeforeArrival: number
	penaltyType: "percentage" | "fixed"
	penaltyAmount?: number
}

export function calculateCancellationPenalty(
	tiers: CancellationTierModel[],
	arrivalDate: string | Date,
	cancelDate: string | Date,
	totalAmount: number
): number {
	const arrival = new Date(arrivalDate)
	const cancel = new Date(cancelDate)

	const diffDays = Math.ceil((arrival.getTime() - cancel.getTime()) / (1000 * 60 * 60 * 24))

	const sorted = [...tiers].sort((a, b) => a.daysBeforeArrival - b.daysBeforeArrival)

	let applied: CancellationTierModel | null = null

	for (const tier of sorted) {
		if (diffDays <= tier.daysBeforeArrival) {
			applied = tier
		}
	}

	if (!applied) return 0

	if (applied.penaltyType === "percentage") {
		return (totalAmount * (applied.penaltyAmount ?? 0)) / 100
	}

	return applied.penaltyAmount ?? 0
}
