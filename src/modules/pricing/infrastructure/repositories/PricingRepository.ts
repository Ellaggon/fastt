import { listCommercialPriceRulesByRatePlan } from "@/lib/commercial-rules/commercialRulesRepository"
import { adaptPriceRule } from "../../domain/adapters/adapter.priceRule"
import type { AppliedPriceRule } from "../../domain/pricing.types"
import type { PricingRepositoryPort } from "../../application/ports/PricingRepositoryPort"

export class PricingRepository implements PricingRepositoryPort {
	async getRules(ratePlanId: string): Promise<AppliedPriceRule[]> {
		const rows = await listCommercialPriceRulesByRatePlan(ratePlanId)

		return rows.map(adaptPriceRule).filter((r): r is AppliedPriceRule => r !== null)
	}

	async getPreviewRules(ratePlanId: string) {
		// Deterministic ordering for preview computations: createdAt ASC.
		// (id ASC tie-breaker is implicit in SQLite row ordering only sometimes; we do it explicitly.)
		const rows = (await listCommercialPriceRulesByRatePlan(ratePlanId)).sort((a, b) => {
			const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime()
			if (byCreatedAt !== 0) return byCreatedAt
			return a.id.localeCompare(b.id)
		})

		// Only active rules should affect preview computations.
		const active = rows.filter((r) => r.isActive)
		// NOTE: We intentionally do NOT adapt types here. Use-cases validate allowed types.
		return active.map((r) => ({
			id: r.id,
			type: r.type,
			value: r.value,
			priority: Number(r.priority ?? 10),
			dateRangeJson: (r as any).dateRangeJson ?? null,
			dayOfWeekJson: Array.isArray((r as any).dayOfWeekJson)
				? (r as any).dayOfWeekJson.map((value: unknown) => Number(value))
				: null,
			createdAt: r.createdAt,
		})) as Array<{
			id: string
			type: string
			value: number
			priority: number
			dateRangeJson?: { from?: string | null; to?: string | null } | null
			dayOfWeekJson?: number[] | null
			createdAt: Date
		}>
	}
}
