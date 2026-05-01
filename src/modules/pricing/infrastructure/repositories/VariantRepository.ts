import {
	and,
	asc,
	db,
	desc,
	eq,
	inArray,
	lte,
	or,
	RatePlan,
	RatePlanOccupancyPolicy,
	sql,
	Variant,
	VariantCapacity,
} from "astro:db"
import type {
	VariantKind,
	VariantRepositoryPort,
	VariantSnapshot,
} from "../../application/ports/VariantRepositoryPort"

const VARIANT_KINDS = ["hotel_room", "tour_slot", "package_base"] as const
const SEARCHABLE_VARIANT_STATUSES = ["ready", "sellable", "published"] as const

function assertVariantKind(kind: string | null): VariantKind {
	if (kind && VARIANT_KINDS.includes(kind as VariantKind)) {
		return kind as VariantKind
	}
	throw new Error(`Invalid kind from DB: ${String(kind)}`)
}

export class VariantRepository implements VariantRepositoryPort {
	async getById(id: string): Promise<VariantSnapshot | null | undefined> {
		const row = await db
			.select({
				id: Variant.id,
				productId: Variant.productId,
				kind: Variant.kind,
				name: Variant.name,
				capacityMin: VariantCapacity.minOccupancy,
				capacityMax: VariantCapacity.maxOccupancy,
			})
			.from(Variant)
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.where(eq(Variant.id, id))
			.get()

		if (!row) return row

		if (row.capacityMin == null || row.capacityMax == null) {
			throw new Error(`Missing capacity for variant ${row.id}`)
		}

		const baseRate = await this.resolveBaseRateByVariantIds([row.id])
		const variantBase = baseRate.get(row.id)
		if (!variantBase) {
			throw new Error(`Missing base rate for variant ${row.id}`)
		}
		return {
			id: row.id,
			productId: row.productId,
			kind: assertVariantKind(row.kind),
			name: row.name,
			pricing: {
				basePrice: variantBase.basePrice,
				currency: variantBase.currency,
			},
			capacity: {
				minOccupancy: row.capacityMin,
				maxOccupancy: row.capacityMax,
			},
		}
	}

	async existsById(id: string): Promise<boolean> {
		const row = await db.select({ id: Variant.id }).from(Variant).where(eq(Variant.id, id)).get()
		return !!row
	}

	// Still used by non-ported legacy code paths.
	async getActiveByProduct(productId: string): Promise<VariantSnapshot[]> {
		const rows = await db
			.select({
				id: Variant.id,
				productId: Variant.productId,
				kind: Variant.kind,
				name: Variant.name,
				capacityMin: VariantCapacity.minOccupancy,
				capacityMax: VariantCapacity.maxOccupancy,
			})
			.from(Variant)
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.where(
				and(
					eq(Variant.productId, productId),
					or(eq(Variant.isActive, true), inArray(Variant.status, SEARCHABLE_VARIANT_STATUSES))
				)
			)
			.all()
		const baseRateByVariant = await this.resolveBaseRateByVariantIds(
			rows.map((row) => String(row.id))
		)

		return rows.flatMap((row) => {
			if (row.capacityMin == null || row.capacityMax == null) return []
			const baseRate = baseRateByVariant.get(String(row.id))
			if (!baseRate) return []
			return [
				{
					id: row.id,
					productId: row.productId,
					kind: assertVariantKind(row.kind),
					name: row.name,
					pricing: {
						basePrice: baseRate.basePrice,
						currency: baseRate.currency,
					},
					capacity: {
						minOccupancy: row.capacityMin,
						maxOccupancy: row.capacityMax,
					},
				},
			]
		})
	}

	private async resolveBaseRateByVariantIds(
		variantIds: string[]
	): Promise<Map<string, { basePrice: number; currency: string }>> {
		const ids = [...new Set(variantIds.map((id) => String(id)).filter(Boolean))]
		if (!ids.length) return new Map()

		const defaultPlans = await db
			.select({
				variantId: RatePlan.variantId,
				ratePlanId: RatePlan.id,
			})
			.from(RatePlan)
			.where(
				and(
					inArray(RatePlan.variantId, ids),
					eq(RatePlan.isDefault, true),
					eq(RatePlan.isActive, true)
				)
			)
			.orderBy(asc(RatePlan.createdAt), asc(RatePlan.id))
			.all()

		const planByVariant = new Map<string, string>()
		for (const plan of defaultPlans) {
			const variantId = String(plan.variantId)
			if (!planByVariant.has(variantId)) {
				planByVariant.set(variantId, String(plan.ratePlanId))
			}
		}
		const selectedRatePlanIds = [...new Set(planByVariant.values())]
		if (!selectedRatePlanIds.length) return new Map()
		const targetDate = new Date()

		const policies = await db
			.select({
				id: RatePlanOccupancyPolicy.id,
				ratePlanId: RatePlanOccupancyPolicy.ratePlanId,
				basePrice: RatePlanOccupancyPolicy.baseAmount,
				currency: RatePlanOccupancyPolicy.currency,
			})
			.from(RatePlanOccupancyPolicy)
			.where(
				and(
					inArray(RatePlanOccupancyPolicy.ratePlanId, selectedRatePlanIds),
					lte(RatePlanOccupancyPolicy.effectiveFrom, targetDate),
					sql`${RatePlanOccupancyPolicy.effectiveTo} > ${targetDate}`
				)
			)
			.orderBy(desc(RatePlanOccupancyPolicy.effectiveFrom), desc(RatePlanOccupancyPolicy.id))
			.all()

		const policyByRatePlan = new Map<string, { basePrice: number; currency: string }>()
		for (const policy of policies) {
			const ratePlanId = String(policy.ratePlanId)
			if (!policyByRatePlan.has(ratePlanId)) {
				policyByRatePlan.set(ratePlanId, {
					basePrice: Number(policy.basePrice ?? 0),
					currency: String(policy.currency ?? "USD"),
				})
			}
		}

		const result = new Map<string, { basePrice: number; currency: string }>()
		for (const [variantId, ratePlanId] of planByVariant.entries()) {
			const policy = policyByRatePlan.get(ratePlanId)
			if (policy) result.set(variantId, policy)
		}

		return result
	}
}
