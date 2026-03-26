import { db, VariantInventoryConfig, eq } from "astro:db"
import type { VariantInventoryConfigRepositoryPort } from "../../application/ports/VariantInventoryConfigRepositoryPort"

export class VariantInventoryConfigRepository implements VariantInventoryConfigRepositoryPort {
	async getByVariantId(variantId: string) {
		const row = await db
			.select()
			.from(VariantInventoryConfig)
			.where(eq(VariantInventoryConfig.variantId, variantId))
			.get()
		return row ?? null
	}

	async upsert(params: { variantId: string; defaultTotalUnits: number; horizonDays?: number }) {
		await db
			.insert(VariantInventoryConfig)
			.values({
				variantId: params.variantId,
				defaultTotalUnits: params.defaultTotalUnits,
				horizonDays: params.horizonDays ?? 365,
				createdAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [VariantInventoryConfig.variantId],
				set: {
					defaultTotalUnits: params.defaultTotalUnits,
					horizonDays: params.horizonDays ?? 365,
					createdAt: new Date(),
				},
			})
	}
}
