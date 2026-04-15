import { db, Variant, PricingBaseRate, VariantCapacity, eq, and } from "astro:db"
import type {
	VariantKind,
	VariantRepositoryPort,
	VariantSnapshot,
} from "../../application/ports/VariantRepositoryPort"

const VARIANT_KINDS = ["hotel_room", "tour_slot", "package_base"] as const

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
				baseRateBasePrice: PricingBaseRate.basePrice,
				baseRateCurrency: PricingBaseRate.currency,
				capacityMin: VariantCapacity.minOccupancy,
				capacityMax: VariantCapacity.maxOccupancy,
			})
			.from(Variant)
			.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.where(eq(Variant.id, id))
			.get()

		if (!row) return row

		if (row.capacityMin == null || row.capacityMax == null) {
			throw new Error(`Missing capacity for variant ${row.id}`)
		}

		if (row.baseRateBasePrice == null || !row.baseRateCurrency) {
			throw new Error(`Missing base rate for variant ${row.id}`)
		}
		return {
			id: row.id,
			productId: row.productId,
			kind: assertVariantKind(row.kind),
			name: row.name,
			pricing: {
				basePrice: row.baseRateBasePrice,
				currency: row.baseRateCurrency,
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
				baseRateBasePrice: PricingBaseRate.basePrice,
				baseRateCurrency: PricingBaseRate.currency,
				capacityMin: VariantCapacity.minOccupancy,
				capacityMax: VariantCapacity.maxOccupancy,
			})
			.from(Variant)
			.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
			.leftJoin(VariantCapacity, eq(VariantCapacity.variantId, Variant.id))
			.where(and(eq(Variant.productId, productId), eq(Variant.isActive, true)))
			.all()

		return rows.flatMap((row) => {
			if (row.capacityMin == null || row.capacityMax == null) return []
			if (row.baseRateBasePrice == null || !row.baseRateCurrency) return []
			return [
				{
					id: row.id,
					productId: row.productId,
					kind: assertVariantKind(row.kind),
					name: row.name,
					pricing: {
						basePrice: row.baseRateBasePrice,
						currency: row.baseRateCurrency,
					},
					capacity: {
						minOccupancy: row.capacityMin,
						maxOccupancy: row.capacityMax,
					},
				},
			]
		})
	}
}
