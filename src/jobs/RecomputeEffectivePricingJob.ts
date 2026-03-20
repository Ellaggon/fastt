import { db, RatePlan } from "astro:db"
import { pricingEngine, pricingRepository } from "@/container"

export async function runPricingRecomputeJob() {
	const ratePlans = await db.select().from(RatePlan)

	for (const rp of ratePlans) {
		const rules = await pricingRepository.getRules(rp.id)

		const result = pricingEngine.computeDaily({
			basePrice: 100,
			rules,
			currency: "USD",
		})

		await pricingRepository.saveEffectivePrice({
			variantId: rp.variantId,
			ratePlanId: rp.id,
			date: new Date().toISOString().split("T")[0],
			basePrice: 100,
			finalBasePrice: result.total,
		})
	}
}
