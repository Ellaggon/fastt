import { variantRepository } from "@/container/pricing.container"
import { searchReadModelRepository } from "@/container/search-read-model.container"
import { db, eq, Variant, VariantCapacity } from "astro:db"
import type { SearchUnit } from "@/modules/search/public"
import type { UnitType } from "@/modules/search/domain/unit.types"
import { isUnitType } from "@/modules/search/domain/unit.types"
import type {
	SearchOffersRepositoryPort,
	SearchUnitViewRow,
} from "@/modules/search/application/ports/SearchOffersRepository"

export class SearchOffersRepository implements SearchOffersRepositoryPort {
	async listActiveUnitsByProduct(productId: string): Promise<SearchUnit[]> {
		const primaryRows = await variantRepository.getActiveByProduct(productId)
		if (primaryRows.length > 0) {
			return primaryRows
				.map((variant) => ({
					id: variant.id,
					productId: variant.productId,
					kind: variant.kind,
					pricing: variant.pricing,
					capacity: variant.capacity,
				}))
				.filter((unit) => isUnitType(unit.kind))
		}

		const [variants, capacities] = await Promise.all([
			db
				.select({
					id: Variant.id,
					productId: Variant.productId,
					kind: Variant.kind,
					isActive: Variant.isActive,
					status: Variant.status,
				})
				.from(Variant)
				.where(eq(Variant.productId, productId))
				.all(),
			db
				.select({
					variantId: VariantCapacity.variantId,
					minOccupancy: VariantCapacity.minOccupancy,
					maxOccupancy: VariantCapacity.maxOccupancy,
				})
				.from(VariantCapacity)
				.all(),
		])

		const capacityByVariantId = new Map(
			capacities.map((row) => [
				String(row.variantId),
				{
					minOccupancy: Math.max(1, Number(row.minOccupancy ?? 1)),
					maxOccupancy: Math.max(1, Number(row.maxOccupancy ?? 1)),
				},
			])
		)

		return variants
			.filter((variant) => {
				const status = String(variant.status ?? "").toLowerCase()
				return Boolean(variant.isActive) || status === "ready"
			})
			.filter((variant) => isUnitType(String(variant.kind)))
			.map((variant) => {
				const variantId = String(variant.id)
				const capacity = capacityByVariantId.get(variantId)
				return {
					id: variantId,
					productId: String(variant.productId),
					kind: String(variant.kind) as UnitType,
					pricing: {
						basePrice: 0,
						currency: "USD",
					},
					capacity,
				}
			})
	}

	async listSearchUnitViewRows(params: {
		unitIds: string[]
		from: string
		to: string
		occupancyKey: string
	}): Promise<SearchUnitViewRow[]> {
		return searchReadModelRepository.listSearchUnitViewRows(params)
	}

	async listEffectivePricingV2Rows(params: {
		unitIds: string[]
		ratePlanIds: string[]
		from: string
		to: string
		occupancyKey: string
	}): Promise<
		Array<{
			variantId: string
			ratePlanId: string
			date: string
			finalBasePrice: number
			baseComponent?: number
			occupancyAdjustment?: number
			ruleAdjustment?: number
		}>
	> {
		return searchReadModelRepository.listEffectivePricingV2Rows(params)
	}
}
