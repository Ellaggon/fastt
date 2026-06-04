export function computeRatePlanPriority(ratePlan: any, rules: { type: string }[]): number {
	let score = 0

	score += rules.length * 5

	return score
}
