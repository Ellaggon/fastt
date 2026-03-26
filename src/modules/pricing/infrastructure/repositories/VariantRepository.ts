import { db, Variant, PricingBaseRate, eq, and } from "astro:db"
import type {
	VariantRepositoryPort,
	VariantSnapshot,
} from "../../application/ports/VariantRepositoryPort"

export class VariantRepository implements VariantRepositoryPort {
	async getById(id: string): Promise<VariantSnapshot | null | undefined> {
		const row = await db
			.select({
				id: Variant.id,
				productId: Variant.productId,
				entityType: Variant.entityType,
				entityId: Variant.entityId,
				name: Variant.name,
				baseRateBasePrice: PricingBaseRate.basePrice,
				baseRateCurrency: PricingBaseRate.currency,
			})
			.from(Variant)
			.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
			.where(eq(Variant.id, id))
			.get()

		if (!row) return row

		return {
			id: row.id,
			productId: row.productId,
			entityType: row.entityType,
			entityId: row.entityId,
			name: row.name,
			basePrice: row.baseRateBasePrice ?? null,
			currency: row.baseRateCurrency ?? null,
		}
	}

	// Still used by non-ported legacy code paths.
	async getActiveByProduct(productId: string): Promise<VariantSnapshot[]> {
		const rows = await db
			.select({
				id: Variant.id,
				productId: Variant.productId,
				entityType: Variant.entityType,
				entityId: Variant.entityId,
				name: Variant.name,
				baseRateBasePrice: PricingBaseRate.basePrice,
				baseRateCurrency: PricingBaseRate.currency,
			})
			.from(Variant)
			.leftJoin(PricingBaseRate, eq(PricingBaseRate.variantId, Variant.id))
			.where(and(eq(Variant.productId, productId), eq(Variant.isActive, true)))
			.all()

		return rows.map((row) => ({
			id: row.id,
			productId: row.productId,
			entityType: row.entityType,
			entityId: row.entityId,
			name: row.name,
			basePrice: row.baseRateBasePrice ?? null,
			currency: row.baseRateCurrency ?? null,
		}))
	}
}
