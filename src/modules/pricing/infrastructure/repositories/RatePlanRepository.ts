import { asc, db, RatePlan, RatePlanTemplate, eq, and } from "astro:db"
import type { RatePlanRepositoryPort } from "../../application/ports/RatePlanRepositoryPort"

type RatePlanWithTemplate = typeof RatePlan.$inferSelect & {
	template: typeof RatePlanTemplate.$inferSelect
}

export class RatePlanRepository implements RatePlanRepositoryPort {
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

	async getDefaultByVariant(variantId: string): Promise<RatePlanWithTemplate | null> {
		// CAPA 4B hardening:
		// - No silent fallback. If there's no explicit default plan, return null.
		// - Deterministic selection: oldest default plan wins (createdAt ASC).
		const chosen = await db
			.select()
			.from(RatePlan)
			.where(
				and(
					eq(RatePlan.variantId, variantId),
					eq(RatePlan.isActive, true),
					eq(RatePlan.isDefault, true)
				)
			)
			.orderBy(asc(RatePlan.createdAt), asc(RatePlan.id))
			.get()

		if (!chosen) return null

		const template = await db
			.select()
			.from(RatePlanTemplate)
			.where(eq(RatePlanTemplate.id, chosen.templateId))
			.get()

		if (!template) return null

		return {
			...chosen,
			template,
		}
	}

	// Still used by non-ported legacy code paths.
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
