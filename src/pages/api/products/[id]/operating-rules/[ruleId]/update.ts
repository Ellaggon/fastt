import type { APIRoute } from "astro"
import { db, eq, and, lte, gte, ne, OperatingRule } from "astro:db"

export const PUT: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const ruleId = params.ruleId

	if (!productId || !ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	const body = await request.json()
	const {
		presetKey,
		enabled,
		dateFrom,
		dateTo,
		params: ruleParams,
		priority,
		scope,
		scopeId,
	} = body

	if (
		presetKey === undefined &&
		enabled === undefined &&
		!dateFrom &&
		!dateTo &&
		!ruleParams &&
		priority === undefined &&
		!scope &&
		scopeId === undefined
	) {
		return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400 })
	}

	const fromDate = dateFrom ? new Date(dateFrom) : undefined
	const toDate = dateTo ? new Date(dateTo) : undefined

	if (presetKey && fromDate && toDate) {
		const overlap = await db
			.select()
			.from(OperatingRule)
			.where(
				and(
					eq(OperatingRule.productId, productId),
					eq(OperatingRule.presetKey, presetKey),
					lte(OperatingRule.dateFrom, toDate),
					gte(OperatingRule.dateTo, fromDate),
					ne(OperatingRule.id, ruleId)
				)
			)

		if (overlap.length) {
			return new Response(JSON.stringify({ error: "Regla solapada en fechas" }), { status: 409 })
		}
	}

	await db
		.update(OperatingRule)
		.set({
			...(presetKey && { presetKey }),
			...(enabled !== undefined && { enabled }),
			...(fromDate && { dateFrom: fromDate }),
			...(toDate && { dateTo: toDate }),
			...(ruleParams && { params: ruleParams }),
			...(priority !== undefined && { priority }),
			...(scope && { scope }),
			...(scopeId !== undefined && { scopeId }),
		})
		.where(eq(OperatingRule.id, ruleId))

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
