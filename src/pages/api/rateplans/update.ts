import type { APIRoute } from "astro"
import { db, RatePlan, eq } from "astro:db"

export const PUT: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()
		const id = body.id

		if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 })

		await db
			.update(RatePlan)
			.set({
				name: body.name,
				description: body.description ?? null,
				type: body.type ?? "modifier",
				valueUSD: body.valueUSD ?? 0,
				valueBOB: body.valueBOB ?? 0,
				refundable: body.refundable ?? true,
				cancellationPolicyId: body.cancellationPolicyId ?? null,
				paymentType: body.paymentType ?? "Prepaid",
				minNights: body.minNights ?? 1,
				maxNights: body.maxNights ?? null,
				minAdvanceDays: body.minAdvanceDays ?? 0,
				maxAdvanceDays: body.maxAdvanceDays ?? null,
				validDays: body.validDays ?? null,
				startDate: body.startDate ?? null,
				endDate: body.endDate ?? null,
				isActive: body.isActive ?? true,
			})
			.where(eq(RatePlan.id, id))

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (e) {
		console.error("rateplans:update", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
