export interface PriceRuleRepositoryPort {
	getActive(ratePlanId: string): Promise<any[]>
}
