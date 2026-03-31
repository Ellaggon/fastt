import { db, PricingBaseRate, eq } from "astro:db"
import type { BaseRateRepositoryPort } from "../../application/ports/BaseRateRepositoryPort"

export class BaseRateRepository implements BaseRateRepositoryPort {
	async getByVariantId(variantId: string) {
		const row = await db
			.select()
			.from(PricingBaseRate)
			.where(eq(PricingBaseRate.variantId, variantId))
			.get()
		return row ?? null
	}

	async upsert(params: { variantId: string; currency: string; basePrice: number }): Promise<void> {
		await db
			.insert(PricingBaseRate)
			.values({
				variantId: params.variantId,
				currency: params.currency,
				basePrice: params.basePrice,
				createdAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [PricingBaseRate.variantId],
				set: {
					currency: params.currency,
					basePrice: params.basePrice,
					createdAt: new Date(),
				},
			})
	}
}
