export function getRatePlanPriority(ratePlan: any): number {
	switch (ratePlan.type) {
		case "package":
			return 100
		case "fixed":
			return 80
		case "modifier":
			return 60
		case "base":
			return 10
		default:
			return 0
	}
}
