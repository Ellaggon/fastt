import { listCommercialSellabilityRulesForScopes } from "@/lib/commercial-rules/commercialRulesRepository"
import { toISODate } from "@/shared/domain/date/date.utils"
import { mapRestrictionRow } from "../../application/mappers/restrictions.mapper"
import type {
	RestrictionContext,
	RestrictionRow,
} from "../../domain/restrictions/restrictions.types"

export class RestrictionRepository {
	async loadActiveRules(ctx: RestrictionContext): Promise<RestrictionRow[]> {
		const checkInISO = toISODate(ctx.checkIn)
		const checkOutISO = toISODate(ctx.checkOut)

		const scopeIds = [ctx.productId, ctx.variantId, ctx.ratePlanId]
			.map((value) => String(value ?? "").trim())
			.filter(Boolean)
		if (scopeIds.length === 0) return []

		const raw = (await listCommercialSellabilityRulesForScopes({ scopeIds })).filter(
			(rule) => rule.isActive && rule.startDate <= checkOutISO && rule.endDate >= checkInISO
		)

		return raw.map(mapRestrictionRow).filter(Boolean) as RestrictionRow[]
	}

	async loadByScope(scope: string, scopeId: string) {
		const raw = (await listCommercialSellabilityRulesForScopes({ scopeIds: [scopeId] })).filter(
			(rule) => rule.scope === scope
		)

		return raw.map(mapRestrictionRow).filter(Boolean) as RestrictionRow[]
	}

	async create(rule: RestrictionRow) {
		void rule
		throw new Error("legacy_restriction_write_disabled")
	}

	async update(rule: RestrictionRow) {
		void rule
		throw new Error("legacy_restriction_write_disabled")
	}

	async delete(id: string) {
		void id
		throw new Error("legacy_restriction_write_disabled")
	}
}
