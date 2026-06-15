import { listCommercialPriceRulesByRatePlan } from "@/lib/commercial-rules/commercialRulesRepository"
import type { PriceRuleRepositoryPort } from "../../application/ports/PriceRuleRepositoryPort"
import type { CommercialPriceRule as DomainCommercialPriceRule } from "../../domain/rate-plans/ratePlan.types"

export class PriceRuleRepository implements PriceRuleRepositoryPort {
	async getActive(ratePlanId: string): Promise<DomainCommercialPriceRule[]> {
		const rows = await listCommercialPriceRulesByRatePlan(ratePlanId)

		return rows.map((r) => ({
			id: r.id,
			ratePlanId: r.ratePlanId,
			occupancyKey: String(r.occupancyKey ?? "").trim() || null,
			type: r.type as DomainCommercialPriceRule["type"],
			value: r.value,
			isActive: r.isActive,
		}))
	}
}
