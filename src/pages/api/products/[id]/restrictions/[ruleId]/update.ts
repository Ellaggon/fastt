import type { APIRoute } from "astro"
import { db, eq, and, lte, gte, ne, Restriction } from "astro:db"

export const PUT: APIRoute = async ({ params, request }) => {
	const productId = params.id
	const ruleId = params.ruleId

	if (!productId || !ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	const body = await request.json()

	const { type, value, startDate, endDate, validDays, isActive, scope, scopeId } = body

	if (
		type === undefined &&
		value === undefined &&
		!startDate &&
		!endDate &&
		validDays === undefined &&
		isActive === undefined &&
		!scope &&
		scopeId === undefined
	) {
		return new Response(JSON.stringify({ error: "No fields to update" }), { status: 400 })
	}

	const fromDate = startDate ? new Date(startDate) : undefined
	const toDate = endDate ? new Date(endDate) : undefined

	// 🔒 Validación de solapamiento por tipo + scope
	if (type && fromDate && toDate) {
		const overlap = await db
			.select()
			.from(Restriction)
			.where(
				and(
					eq(Restriction.scopeId, productId),
					eq(Restriction.type, type),
					lte(Restriction.startDate, toDate),
					gte(Restriction.endDate, fromDate),
					ne(Restriction.id, ruleId)
				)
			)

		if (overlap.length) {
			return new Response(JSON.stringify({ error: "Restricción solapada en fechas" }), {
				status: 409,
			})
		}
	}

	await db
		.update(Restriction)
		.set({
			...(type && { type }),
			...(value !== undefined && { value }),
			...(fromDate && { startDate: fromDate }),
			...(toDate && { endDate: toDate }),
			...(validDays !== undefined && { validDays }),
			...(isActive !== undefined && { isActive }),
			...(scope && { scope }),
			...(scopeId !== undefined && { scopeId }),
		})
		.where(eq(Restriction.id, ruleId))

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
