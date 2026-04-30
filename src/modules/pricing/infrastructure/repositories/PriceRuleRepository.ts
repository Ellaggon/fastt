import { db, PriceRule, eq } from "astro:db"
import type { PriceRuleRepositoryPort } from "../../application/ports/PriceRuleRepositoryPort"
import type { PriceRule as DomainPriceRule } from "../../domain/rate-plans/ratePlan.types"

export class PriceRuleRepository implements PriceRuleRepositoryPort {
	async getActive(ratePlanId: string): Promise<DomainPriceRule[]> {
		const rows = await db.select().from(PriceRule).where(eq(PriceRule.ratePlanId, ratePlanId))

		return rows.map((r) => ({
			id: r.id,
			ratePlanId: r.ratePlanId,
			occupancyKey: String((r as any).occupancyKey ?? "").trim() || null,
			type: r.type as DomainPriceRule["type"],
			value: r.value,
			isActive: r.isActive,
		}))
	}
}
