import { first, db, RatePlan, eq } from "@/shared/infrastructure/db/compat"
import { resolveRatePlanBaseSelect } from "@/lib/rates/ratePlanSchemaCompat"
import type { RatePlanRepositoryPort } from "../../application/ports/RatePlanRepositoryPort"

type RatePlanWithTemplate = typeof RatePlan.$inferSelect & {
	template: {
		id: string
		name: string
		description: string | null
		createdAt: Date | null
	}
}

export class RatePlanRepository implements RatePlanRepositoryPort {
	async getActiveByVariant(variantId: string): Promise<RatePlanWithTemplate[]> {
		const ratePlanSelect = await resolveRatePlanBaseSelect()
		const plans = await db
			.select(ratePlanSelect)
			.from(RatePlan)
			.where(eq(RatePlan.variantId, variantId))

		const results: RatePlanWithTemplate[] = []

		for (const p of plans) {
			if (!p.isActive) continue

			results.push({
				...p,
				template: {
					id: String(p.id),
					name: String(p.name ?? "Tarifa"),
					description: p.description ?? null,
					createdAt: p.createdAt ?? null,
				},
			})
		}

		return results
	}

	// Still used by non-ported legacy code paths.
	async get(ratePlanId: string): Promise<RatePlanWithTemplate | null> {
		const ratePlanSelect = await resolveRatePlanBaseSelect()
		const plan = await db
			.select(ratePlanSelect)
			.from(RatePlan)
			.where(eq(RatePlan.id, ratePlanId))
			.then(first)

		if (!plan) return null

		return {
			...plan,
			template: {
				id: String(plan.id),
				name: String(plan.name ?? "Tarifa"),
				description: plan.description ?? null,
				createdAt: plan.createdAt ?? null,
			},
		}
	}
}
