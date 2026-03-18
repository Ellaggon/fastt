import { db, RatePlan, RatePlanTemplate, eq } from "astro:db"

type RatePlanWithTemplate = typeof RatePlan.$inferSelect & {
	template: typeof RatePlanTemplate.$inferSelect
}

export class RatePlanRepository {
	async getActiveByVariant(variantId: string): Promise<RatePlanWithTemplate[]> {
		const plans = await db.select().from(RatePlan).where(eq(RatePlan.variantId, variantId))

		const results: RatePlanWithTemplate[] = []

		for (const p of plans) {
			if (!p.isActive) continue

			const template = await db
				.select()
				.from(RatePlanTemplate)
				.where(eq(RatePlanTemplate.id, p.templateId))
				.get()

			if (!template) continue

			results.push({
				...p,
				template,
			})
		}

		return results
	}

	async get(ratePlanId: string): Promise<RatePlanWithTemplate | null> {
		const plan = await db.select().from(RatePlan).where(eq(RatePlan.id, ratePlanId)).get()

		if (!plan) return null

		const template = await db
			.select()
			.from(RatePlanTemplate)
			.where(eq(RatePlanTemplate.id, plan.templateId))
			.get()

		if (!template) return null

		return {
			...plan,
			template,
		}
	}
}
