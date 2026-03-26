import { db, PriceRule, RatePlan, eq } from "astro:db"
import type { PriceRuleQueryRepositoryPort } from "../../application/ports/PriceRuleQueryRepositoryPort"

export class PriceRuleQueryRepository implements PriceRuleQueryRepositoryPort {
	async getVariantIdByRuleId(ruleId: string): Promise<string | null> {
		const rule = await db.select().from(PriceRule).where(eq(PriceRule.id, ruleId)).get()
		if (!rule) return null

		const rp = await db.select().from(RatePlan).where(eq(RatePlan.id, rule.ratePlanId)).get()
		return rp?.variantId ?? null
	}
}
