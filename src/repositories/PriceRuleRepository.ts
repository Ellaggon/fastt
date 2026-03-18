// src/repositories/PriceRuleRepository.ts

import { db, PriceRule, eq } from "astro:db"
import type { PriceRule as DomainPriceRule } from "@/core/rate-plans/ratePlan.types"

export class PriceRuleRepository {
	async getActive(ratePlanId: string): Promise<DomainPriceRule[]> {
		const rows = await db.select().from(PriceRule).where(eq(PriceRule.ratePlanId, ratePlanId))

		return rows.map((r) => ({
			id: r.id,
			ratePlanId: r.ratePlanId,
			type: r.type as DomainPriceRule["type"],
			value: r.value,
			isActive: r.isActive,
		}))
	}
}
