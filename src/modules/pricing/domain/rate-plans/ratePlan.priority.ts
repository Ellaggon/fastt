export function computeRatePlanPriority(ratePlan: any, rules: { type: string }[]): number {
	let score = 0

	// Deprecated RatePlanTemplate fields are merchandising hints only; CAPA 6 policies
	// remain the contractual source for payment/refund behavior.
	if (ratePlan.template?.paymentType === "prepaid") score += 20
	if (!ratePlan.template?.refundable) score += 10

	score += rules.length * 5

	return score
}
