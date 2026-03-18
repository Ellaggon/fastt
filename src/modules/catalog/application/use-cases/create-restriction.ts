import { computeRestrictionPriority } from "@/core/restrictions/restrictions.priority"
import { toISODate } from "@/core/date/date.utils"
import { db, and, eq, lte, gte, Restriction } from "astro:db"
import { randomUUID } from "node:crypto"

export async function createRestriction(params: {
	productId: string
	body: any
}): Promise<Response> {
	const { productId, body } = params
	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	const { scope, scopeId, type, value, startDate, endDate, validDays, isActive } = body || {}

	if (!scope || !scopeId || !type || !startDate || !endDate) {
		return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
	}

	const startISO = toISODate(new Date(startDate))
	const endISO = toISODate(new Date(endDate))

	const overlap = await db
		.select()
		.from(Restriction)
		.where(
			and(
				eq(Restriction.scope, scope),
				eq(Restriction.scopeId, scopeId),
				eq(Restriction.type, type),
				lte(Restriction.startDate, endISO),
				gte(Restriction.endDate, startISO)
			)
		)

	if (overlap.length) {
		return new Response(JSON.stringify({ error: "Restriction overlaps existing rule" }), {
			status: 409,
		})
	}

	await db.insert(Restriction).values({
		id: randomUUID(),
		scope,
		scopeId,
		type,
		value,
		startDate: startISO,
		endDate: endISO,
		validDays,
		isActive: isActive ?? true,
		priority: computeRestrictionPriority(body.scope, body.type),
	})

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
