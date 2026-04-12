export type CreatePriceRuleCommand = {
	id: string
	ratePlanId: string
	name: string | null
	type: string
	value: number
	priority: number
	dateRangeJson?: { from?: string | null; to?: string | null } | null
	dayOfWeekJson?: number[] | null
	isActive: boolean
	createdAt: Date
}

export interface PriceRuleCommandRepositoryPort {
	create(cmd: CreatePriceRuleCommand): Promise<void>
	updateById(
		ruleId: string,
		patch: {
			name?: string | null
			type: string
			value: number
			priority: number
			dateRangeJson?: { from?: string | null; to?: string | null } | null
			dayOfWeekJson?: number[] | null
		}
	): Promise<"ok" | "not_found">
	deleteById(ruleId: string): Promise<"ok" | "not_found">
}
