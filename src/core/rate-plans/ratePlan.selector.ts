import { db, RatePlan } from "astro:db"
import { eq } from "astro:db"
import { isRatePlanValid } from "./ratePlan.validators"
import { getRatePlanPriority } from "./ratePlan.utils"
import type { RatePlanContext, SelectedRatePlan } from "./ratePlan.types"

export async function selectRatePlans(context: RatePlanContext): Promise<SelectedRatePlan[]> {
	const ratePlans = await db
		.select()
		.from(RatePlan)
		.where(eq(RatePlan.variantId, context.variantId))

	// 1️⃣ Filtrar válidos
	const validPlans = ratePlans.filter((rp) => {
		const valid = isRatePlanValid({
			ratePlan: rp,
			checkIn: context.checkIn,
			checkOut: context.checkOut,
		})

		if (!valid) {
			console.log("❌ RatePlan descartado", {
				id: rp.id,
				startDate: rp.startDate,
				endDate: rp.endDate,
				minNights: rp.minNights,
				minAdvanceDays: rp.minAdvanceDays,
			})
		}

		return valid
	})

	if (validPlans.length === 0) return []

	// 2️⃣ Asignar prioridad
	const withPriority = validPlans.map((rp) => ({
		...rp,
		priority: getRatePlanPriority(rp),
	}))

	// 3️⃣ Ordenar
	withPriority.sort((a, b) => b.priority - a.priority)

	// 4️⃣ Marcar default (el primero)
	return withPriority.map((rp, index) => ({
		id: rp.id,
		name: rp.name,
		type: rp.type,
		priority: rp.priority,
		isDefault: index === 0,
	}))
}
