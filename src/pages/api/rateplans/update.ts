import type { APIRoute } from "astro"
import { db, eq, RatePlan, RatePlanTemplate, PriceRule, Restriction } from "astro:db"
import { randomUUID } from "node:crypto"

const ALLOWED_TYPES = [
	"percentage_discount",
	"percentage_markup",
	"fixed_adjustment",
	"override",
	"package",
] as const

export const PUT: APIRoute = async ({ request }) => {
	const body = await request.json()
	const ratePlanId = body.id

	if (!ratePlanId) {
		return new Response(JSON.stringify({ error: "Missing ratePlanId" }), { status: 400 })
	}

	if (!ALLOWED_TYPES.includes(body.type)) {
		return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400 })
	}

	try {
		await db.transaction(async (tx) => {
			const ratePlan = await tx.select().from(RatePlan).where(eq(RatePlan.id, ratePlanId)).get()

			if (!ratePlan) throw new Error("RatePlan not found")

			/* 1️⃣ RATE PLAN */
			await tx
				.update(RatePlan)
				.set({
					isActive: Boolean(body.isActive),
				})
				.where(eq(RatePlan.id, ratePlanId))

			/* 2️⃣ TEMPLATE */
			await tx
				.update(RatePlanTemplate)
				.set({
					name: body.name,
					description: body.description ?? null,
					paymentType: body.paymentType,
					refundable: Boolean(body.refundable),
					cancellationPolicyId: body.cancellationPolicyId ?? null,
				})
				.where(eq(RatePlanTemplate.id, ratePlan.templateId))

			/* 3️⃣ PRICE RULE (REPLACE ALL) */
			await tx.delete(PriceRule).where(eq(PriceRule.ratePlanId, ratePlanId))

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

			/* 4️⃣ RESTRICTIONS (REPLACE ALL) */
			await tx.delete(Restriction).where(eq(Restriction.scopeId, ratePlanId))

			const baseRestriction = {
				scope: "rate_plan",
				scopeId: ratePlanId,
				startDate: new Date().toISOString(),
				endDate: new Date("2099-12-31").toISOString(),
				validDays: null,
				isActive: true,
			}

			if (body.minNights && body.minNights > 1) {
				await tx.insert(Restriction).values({
					id: randomUUID(),
					...baseRestriction,
					type: "min_los",
					value: Number(body.minNights),
				})
			}

			if (body.maxNights) {
				await tx.insert(Restriction).values({
					id: randomUUID(),
					...baseRestriction,
					type: "max_los",
					value: Number(body.maxNights),
				})
			}

			if (body.minAdvanceDays && body.minAdvanceDays > 0) {
				await tx.insert(Restriction).values({
					id: randomUUID(),
					...baseRestriction,
					type: "min_lead_time",
					value: Number(body.minAdvanceDays),
				})
			}

			if (body.maxAdvanceDays) {
				await tx.insert(Restriction).values({
					id: randomUUID(),
					...baseRestriction,
					type: "max_lead_time",
					value: Number(body.maxAdvanceDays),
				})
			}
		})

		return new Response(JSON.stringify({ success: true }), { status: 200 })
	} catch (err) {
		console.error("rateplans:update", err)
		return new Response(JSON.stringify({ error: "Update failed" }), { status: 500 })
	}
}
