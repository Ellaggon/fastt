import type { APIRoute } from "astro"
import { db, eq, and, lte, gte, OperatingRule } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	const body = await request.json()

	const { presetKey, dateFrom, dateTo, params: ruleParams } = body

	if (!presetKey || !dateFrom || !dateTo) {
		return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
	}

	const fromDate = new Date(dateFrom)
	const toDate = new Date(dateTo)

	const overlap = await db
		.select()
		.from(OperatingRule)
		.where(
			and(
				eq(OperatingRule.productId, productId),
				eq(OperatingRule.presetKey, body.presetKey),
				lte(OperatingRule.dateFrom, toDate),
				gte(OperatingRule.dateTo, fromDate)
			)
		)

	if (overlap.length) {
		return new Response(JSON.stringify({ error: "Regla solapada en fechas" }), { status: 409 })
	}

	const newId = randomUUID()

	await db.insert(OperatingRule).values({
		id: newId,
		productId,
		presetKey,
		scope: "product",
		dateFrom: fromDate,
		dateTo: toDate,
		params: ruleParams ?? {},
		enabled: true,
	})

	return new Response(JSON.stringify({ success: true, id: newId }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
