import { db, eq, and, lte, gte, ne, Restriction } from "astro:db"
import { toISODate } from "@/core/date/date.utils"

export async function updateRestriction(params: {
	productId: string
	ruleId: string
	body: any
}): Promise<Response> {
	const { productId, ruleId, body } = params

	if (!productId || !ruleId) {
		return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 })
	}

	const { type, value, startDate, endDate, validDays, isActive, scope, scopeId } = body || {}

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

	const fromISO = startDate ? toISODate(new Date(startDate)) : undefined
	const toISO = endDate ? toISODate(new Date(endDate)) : undefined

	// 🔒 Validación de solapamiento por tipo + scope
	if (type && fromISO && toISO) {
		const overlap = await db
			.select()
			.from(Restriction)
			.where(
				and(
					eq(Restriction.scopeId, productId),
					eq(Restriction.type, type),
					lte(Restriction.startDate, toISO),
					gte(Restriction.endDate, fromISO),
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
			...(fromISO && { startDate: fromISO }),
			...(toISO && { endDate: toISO }),
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
