import { db, Variant, DailyInventory, VariantInventoryConfig, eq } from "astro:db"
import { InventoryBootstrapService } from "./InventoryBootstrapService"

export class VariantInventoryBackfillService {
	constructor(private bootstrapSvc = new InventoryBootstrapService()) {}

	async backfill(params?: {
		defaultTotalUnitsFallback?: number
		horizonDaysFallback?: number
	}): Promise<{ processed: number }> {
		const defaultTotalUnits = params?.defaultTotalUnitsFallback ?? 1
		const horizonDays = params?.horizonDaysFallback ?? 365

		const variants = await db.select({ id: Variant.id }).from(Variant).all()

		let processed = 0
		for (const v of variants) {
			const anyRow = await db
				.select({ id: DailyInventory.id })
				.from(DailyInventory)
				.where(eq(DailyInventory.variantId, v.id))
				.get()

			if (anyRow) continue

			await db
				.insert(VariantInventoryConfig)
				.values({
					variantId: v.id,
					defaultTotalUnits,
					horizonDays,
					createdAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [VariantInventoryConfig.variantId],
					set: {
						defaultTotalUnits,
						horizonDays,
						createdAt: new Date(),
					},
				})

			await this.bootstrapSvc.bootstrap({
				variantId: v.id,
				totalInventory: defaultTotalUnits,
				days: horizonDays,
			})

			processed++
		}

		return { processed }
	}
}
