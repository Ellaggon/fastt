import type { APIRoute } from "astro"
import { db, RatePlanTemplate, RatePlan, PriceRule, Restriction } from "astro:db"
import { randomUUID } from "node:crypto"
import { buildCreateRatePlanSpec } from "@/modules/pricing/application/use-cases/build-create-rateplan-spec"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const specResult = buildCreateRatePlanSpec(body)
	if (!specResult.ok) {
		return new Response(JSON.stringify({ error: specResult.error.message }), { status: 400 })
	}

	const templateId = randomUUID()
	const ratePlanId = randomUUID()

	await db.transaction(async (tx) => {
		/* ---------------- TEMPLATE ---------------- */
		const { restrictions } = specResult.spec

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

		for (const item of restrictions.items) {
			await tx.insert(Restriction).values({
				id: randomUUID(),
				...baseRestriction,
				type: item.type,
				value: item.value,
			})
		}
	})

	return new Response(JSON.stringify({ ratePlanId }), { status: 201 })
}
