import { db, RatePlan } from "astro:db"
import { PricingEngine } from "@/modules/pricing/public"
import { PricingRepository } from "@/repositories/PricingRepository"

export async function runPricingRecomputeJob() {
	const pricingRepo = new PricingRepository()
	const pricingEngine = new PricingEngine()

	const ratePlans = await db.select().from(RatePlan)

	for (const rp of ratePlans) {
		const rules = await pricingRepo.getRules(rp.id)

		const result = pricingEngine.computeDaily({
			basePrice: 100,
			rules,
			currency: "USD",
		})

		await pricingRepo.saveEffectivePrice({
			variantId: rp.variantId,
			ratePlanId: rp.id,
			date: new Date().toISOString().split("T")[0],
			basePrice: 100,
			finalBasePrice: result.total,
		})
	}
}
