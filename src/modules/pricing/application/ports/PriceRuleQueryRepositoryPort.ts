export interface PriceRuleQueryRepositoryPort {
	/**
	 * For ownership checks: resolve the variantId that owns a given price rule.
	 */
	getVariantIdByRuleId(ruleId: string): Promise<string | null>
}
