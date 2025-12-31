import type { APIRoute } from "astro"
import { db, RatePlan } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json()

		if (!body.variantId)
			return new Response(JSON.stringify({ error: "Missing variantId" }), { status: 400 })

		if (!body.name) return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 })

		const validTypes = ["modifier", "fixed", "package", "percentage"]
		if (!validTypes.includes(body.type)) {
			return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400 })
		}

		body.valueUSD = Number(body.valueUSD ?? 0)
		body.valueBOB = Number(body.valueBOB ?? 0)

		if (body.type === "percentage") {
			if (body.valueUSD <= 0 && body.valueBOB <= 0) {
				return new Response(
					JSON.stringify({
						error: "El porcentaje debe ser mayor a 0 (en USD o BOB).",
					}),
					{ status: 400 }
				)
			}
			body.valueUSD = Math.abs(body.valueUSD)
			body.valueBOB = Math.abs(body.valueBOB)
		}

		if (body.type === "fixed") {
			const usdGiven = body.valueUSD !== 0
			const bobGiven = body.valueBOB !== 0

			if (usdGiven && bobGiven) {
				return new Response(
					JSON.stringify({
						error: "Para precios fijos, solo puedes definir USD o BOB, no ambos.",
					}),
					{ status: 400 }
				)
			}

			if (!usdGiven && !bobGiven) {
				return new Response(
					JSON.stringify({
						error: "Debes definir un precio fijo en USD o BOB.",
					}),
					{ status: 400 }
				)
			}
		}

		if (body.type === "package") {
			body.valueUSD = 0
			body.valueBOB = 0
		}

		if (body.startDate && body.endDate) {
			if (new Date(body.endDate) < new Date(body.startDate)) {
				return new Response(
					JSON.stringify({
						error: "La fecha de fin debe ser mayor que la fecha de inicio.",
					}),
					{ status: 400 }
				)
			}
		}

		const id = randomUUID()

		await db.insert(RatePlan).values({
			id,
			variantId: body.variantId,
			name: body.name,
			description: body.description || null,

			type: body.type,
			valueUSD: body.valueUSD,
			valueBOB: body.valueBOB,

			refundable: body.refundable ?? true,
			cancellationPolicyId: body.cancellationPolicyId || null,
			paymentType: body.paymentType || "Prepaid",

			minNights: Number(body.minNights ?? 1),
			maxNights: body.maxNights ? Number(body.maxNights) : null,

			minAdvanceDays: Number(body.minAdvanceDays ?? 0),
			maxAdvanceDays: body.maxAdvanceDays ? Number(body.maxAdvanceDays) : null,

			validDays: body.validDays ?? null,
			startDate: body.startDate ? new Date(body.startDate) : null,
			endDate: body.endDate ? new Date(body.endDate) : null,

			isActive: body.isActive ?? true,
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
