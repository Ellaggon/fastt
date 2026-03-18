import type { APIRoute } from "astro"
import {
	db,
	RatePlan,
	RatePlanTemplate,
	PriceRule,
	Restriction,
	eq,
} from "astro:db"

export const DELETE: APIRoute = async ({ request, url }) => {
	try {
		let id = url.searchParams.get("id")

		if (!id) {
			const body = await request.json().catch(() => null)
			id = body?.id
		}

		if (!id) {
			return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })
		}

		await db.transaction(async (tx) => {
			const ratePlan = await tx
				.select()
				.from(RatePlan)
				.where(eq(RatePlan.id, id))
				.get()

			if (!ratePlan) {
				throw new Error("RatePlan not found")
			}

			// Price rules
			await tx.delete(PriceRule).where(eq(PriceRule.ratePlanId, id))

			// 🔥 Restrictions (reemplaza ApplicabilityRule)
			await tx
				.delete(Restriction)
				.where(eq(Restriction.scopeId, id))

			// Rate plan
			await tx.delete(RatePlan).where(eq(RatePlan.id, id))

			// Template
			if (ratePlan.templateId) {
				await tx
					.delete(RatePlanTemplate)
					.where(eq(RatePlanTemplate.id, ratePlan.templateId))
			}
		})

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (e) {
		console.error("rateplans:delete", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}