export function computeRatePlanPriority(ratePlan: any, rules: { type: string }[]): number {
	let score = 0

	if (ratePlan.template?.paymentType === "prepaid") score += 20
	if (!ratePlan.template?.refundable) score += 10

	score += rules.length * 5

	return score
}
