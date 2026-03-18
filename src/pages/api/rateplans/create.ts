import type { APIRoute } from "astro"
import { db, RatePlanTemplate, RatePlan, PriceRule, Restriction } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	if (
		(body.type === "percentage_discount" || body.type === "percentage_markup") &&
		(body.value < 0 || body.value > 100)
	) {
		return new Response(JSON.stringify({ error: "Invalid percentage" }), { status: 400 })
	}

	if (body.type === "override" && body.value <= 0) {
		return new Response(JSON.stringify({ error: "Override price must be greater than zero" }), {
			status: 400,
		})
	}

	const templateId = randomUUID()
	const ratePlanId = randomUUID()

	await db.transaction(async (tx) => {
		/* ---------------- TEMPLATE ---------------- */
		await tx.insert(RatePlanTemplate).values({
			id: templateId,
			name: body.name,
			description: body.description ?? null,
			paymentType: body.paymentType,
			refundable: Boolean(body.refundable),
			cancellationPolicyId: body.cancellationPolicyId ?? null,
			createdAt: new Date(),
		})

		/* ---------------- RATE PLAN ---------------- */
		await tx.insert(RatePlan).values({
			id: ratePlanId,
			variantId: body.variantId,
			templateId,
			isActive: Boolean(body.isActive),
			createdAt: new Date(),
		})

		/* ---------------- PRICE RULE ---------------- */
		if (body.type !== "package") {
			await tx.insert(PriceRule).values({
				id: randomUUID(),
				ratePlanId,
				name: body.name ?? null,
				type: body.type,
				value: Number(body.value),
				priority: 10,
				isActive: true,
				createdAt: new Date(),
			})
		}

		/* ---------------- RESTRICTIONS ---------------- */

		const baseRestriction = {
			scope: "rate_plan",
			scopeId: ratePlanId,
			startDate: body.startDate ? new Date(body.startDate).toISOString() : new Date().toISOString(),
			endDate: body.endDate
				? new Date(body.endDate).toISOString()
				: new Date("2099-12-31").toISOString(),
			validDays: body.validDays ?? null,
			isActive: true,
		}

		// Min LOS
		if (body.minNights && body.minNights > 1) {
			await tx.insert(Restriction).values({
				id: randomUUID(),
				...baseRestriction,
				type: "min_los",
				value: Number(body.minNights),
			})
		}

		// Max LOS
		if (body.maxNights) {
			await tx.insert(Restriction).values({
				id: randomUUID(),
				...baseRestriction,
				type: "max_los",
				value: Number(body.maxNights),
			})
		}

		// Min Lead Time
		if (body.minAdvanceDays && body.minAdvanceDays > 0) {
			await tx.insert(Restriction).values({
				id: randomUUID(),
				...baseRestriction,
				type: "min_lead_time",
				value: Number(body.minAdvanceDays),
			})
		}

		// Max Lead Time
		if (body.maxAdvanceDays) {
			await tx.insert(Restriction).values({
				id: randomUUID(),
				...baseRestriction,
				type: "max_lead_time",
				value: Number(body.maxAdvanceDays),
			})
		}
	})

	return new Response(JSON.stringify({ ratePlanId }), { status: 201 })
}
