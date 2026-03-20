import { computeRestrictionPriority } from "@/modules/policies/public"
import { toISODate } from "@/shared/domain/date/date.utils"
import { randomUUID } from "node:crypto"
import type { CatalogRestrictionRepositoryPort } from "../ports/CatalogRestrictionRepositoryPort"

export async function createRestriction(
	deps: { repo: CatalogRestrictionRepositoryPort },
	params: { productId: string; body: any }
): Promise<Response> {
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

	const hasOverlap = await deps.repo.findOverlap({
		scope,
		scopeId,
		type,
		startDateISO: startISO,
		endDateISO: endISO,
	})

	if (hasOverlap) {
		return new Response(JSON.stringify({ error: "Restriction overlaps existing rule" }), {
			status: 409,
		})
	}

	await deps.repo.createRestriction({
		id: randomUUID(),
		scope,
		scopeId,
		type,
		value,
		startDateISO: startISO,
		endDateISO: endISO,
		validDays,
		isActive: isActive ?? true,
		priority: computeRestrictionPriority(body.scope, body.type),
	})

	return new Response(JSON.stringify({ success: true }), { status: 200 })
}
