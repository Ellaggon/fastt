import { first, and, db, eq, Product, RatePlan, Variant } from "@/shared/infrastructure/db/compat"
import {
	createCommercialPriceRule,
	deleteCommercialRule,
	getCommercialPriceRule,
	updateCommercialPriceRule,
} from "@/lib/commercial-rules/commercialRulesRepository"
import type {
	CreatePriceRuleCommand,
	PriceRuleCommandRepositoryPort,
} from "../../application/ports/PriceRuleCommandRepositoryPort"

export class PriceRuleCommandRepository implements PriceRuleCommandRepositoryPort {
	async create(cmd: CreatePriceRuleCommand): Promise<void> {
		const owner = await db
			.select({ providerId: Product.providerId })
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(and(eq(RatePlan.id, cmd.ratePlanId), eq(RatePlan.isActive, true)))
			.then(first)
		if (!owner?.providerId) throw new Error("rate_plan_provider_not_found")
		await createCommercialPriceRule({
			providerId: String(owner.providerId),
			ratePlanId: cmd.ratePlanId,
			name: cmd.name ?? null,
			type: cmd.type,
			value: cmd.value,
			priority: cmd.priority ?? 10,
			dateRangeJson: cmd.dateRangeJson ?? null,
			dayOfWeekJson: cmd.dayOfWeekJson ?? null,
			occupancyKey: cmd.occupancyKey ?? null,
		})
	}

	async updateById(
		ruleId: string,
		patch: {
			name?: string | null
			occupancyKey?: string | null
			type: string
			value: number
			priority: number
			dateRangeJson?: { from?: string | null; to?: string | null } | null
			dayOfWeekJson?: number[] | null
		}
	): Promise<"ok" | "not_found"> {
		const existing = await getCommercialPriceRule({ ruleId })
		if (!existing) return "not_found"
		await updateCommercialPriceRule({
			ruleId,
			name: patch.name ?? null,
			type: patch.type,
			value: patch.value,
			priority: patch.priority,
			dateRangeJson: patch.dateRangeJson ?? null,
			dayOfWeekJson: patch.dayOfWeekJson ?? null,
			occupancyKey: patch.occupancyKey ?? null,
		})
		return "ok"
	}

	async deleteById(ruleId: string): Promise<"ok" | "not_found"> {
		const existing = await getCommercialPriceRule({ ruleId })
		if (!existing) return "not_found"
		await deleteCommercialRule(ruleId)
		return "ok"
	}
}
