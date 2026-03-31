export type HouseRuleType = "Children" | "Pets" | "Smoking" | "ExtraBeds" | "Access" | "Other"

export interface HouseRule {
	id: string
	productId: string
	type: HouseRuleType
	description: string
	createdAt: string
}
