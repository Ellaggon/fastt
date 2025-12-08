import type { APIRoute } from "astro"
import { db, RatePlan } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()

		if (!body.variantId)
			return new Response(JSON.stringify({ error: "Missing variantId" }), { status: 400 })
		if (!body.name) return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 })

		const id = randomUUID()

		await db.insert(RatePlan).values({
			id,
			variantId: body.variantId,

			name: body.name,
			description: body.description,

			type: body.type,
			valueUSD: body.valueUSD,
			valueBOB: body.valueBOB,

			refundable: body.refundable,
			cancellationPolicyId: body.cancellationPolicyId,
			paymentType: body.paymentType,

			minNights: body.minNights,
			maxNights: body.maxNights,

			minAdvanceDays: body.minAdvanceDays,
			maxAdvanceDays: body.maxAdvanceDays,

			validDays: body.validDays,
			startDate: body.startDate,
			endDate: body.endDate,

			isActive: body.isActive,
			createdAt: new Date(),
		})

		return new Response(JSON.stringify({ success: true, id }), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		console.error("rateplans:create", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
