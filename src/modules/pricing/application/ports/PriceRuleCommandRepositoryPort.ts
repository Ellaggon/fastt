export type CreatePriceRuleCommand = {
	id: string
	ratePlanId: string
	name: string | null
	type: string
	value: number
	priority: number
	isActive: boolean
	createdAt: Date
}

export interface PriceRuleCommandRepositoryPort {
	create(cmd: CreatePriceRuleCommand): Promise<void>
	deleteById(ruleId: string): Promise<"ok" | "not_found">
}
