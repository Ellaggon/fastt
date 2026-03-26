import { db, Variant, PricingBaseRate } from "astro:db"

/**
 * One-time backfill to populate PricingBaseRate from legacy Variant pricing fields.
 * This does NOT remove legacy fields; it enables safe incremental migration.
 */
export async function backfillPricingBaseRate(): Promise<{ processed: number }> {
	const variants = await db.select().from(Variant).all()

	let processed = 0

	for (const v of variants) {
		if (v.basePrice === null || v.basePrice === undefined) continue
		await db
			.insert(PricingBaseRate)
			.values({
				variantId: v.id,
				currency: (v as any).currency ?? "USD",
				basePrice: Number(v.basePrice),
				createdAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [PricingBaseRate.variantId],
				set: {
					currency: (v as any).currency ?? "USD",
					basePrice: Number(v.basePrice),
					createdAt: new Date(),
				},
			})
		processed++
	}

	return { processed }
}
