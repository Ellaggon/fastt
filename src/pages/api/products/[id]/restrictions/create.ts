import { computeRestrictionPriority } from "@/core/restrictions/restrictions.priority"
import type { APIRoute } from "astro"
import { db, and, eq, lte, gte, Restriction } from "astro:db"
import { randomUUID } from "node:crypto"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	if (!productId) {
		return new Response(JSON.stringify({ error: "Missing productId" }), { status: 400 })
	}

	const body = await request.json()

	const { scope, scopeId, type, value, startDate, endDate, validDays, isActive } = body

	if (!scope || !scopeId || !type || !startDate || !endDate) {
		return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 })
	}

	const overlap = await db
		.select()
		.from(Restriction)
		.where(
			and(
				eq(Restriction.scope, scope),
				eq(Restriction.scopeId, scopeId),
				eq(Restriction.type, type),
				lte(Restriction.startDate, new Date(endDate)),
				gte(Restriction.endDate, new Date(startDate))
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
		startDate: new Date(startDate),
		endDate: new Date(endDate),
		validDays,
		isActive: isActive ?? true,
		priority: computeRestrictionPriority(body.scope, body.type)
	})

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
