import { db, RatePlan, eq } from "astro:db"
import { getCommercialPriceRule } from "@/lib/commercial-rules/commercialRulesRepository"
import type { PriceRuleQueryRepositoryPort } from "../../application/ports/PriceRuleQueryRepositoryPort"

export class PriceRuleQueryRepository implements PriceRuleQueryRepositoryPort {
	async getVariantIdByRuleId(ruleId: string): Promise<string | null> {
		const rule = await getCommercialPriceRule({ ruleId })
		if (!rule) return null

		const rp = await db.select().from(RatePlan).where(eq(RatePlan.id, rule.ratePlanId)).get()
		return rp?.variantId ?? null
	}
}
