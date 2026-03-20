import { toISODate } from "@/shared/domain/date/date.utils"
import type { CatalogRestrictionRepositoryPort } from "../ports/CatalogRestrictionRepositoryPort"

export async function updateRestriction(
	deps: { repo: CatalogRestrictionRepositoryPort },
	params: { productId: string; ruleId: string; body: any }
): Promise<Response> {
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
		const hasOverlap = await deps.repo.findOverlap({
			scope: scope ?? "product",
			scopeId: scopeId ?? productId,
			type,
			startDateISO: fromISO,
			endDateISO: toISO,
			excludeId: ruleId,
		})

		if (hasOverlap) {
			return new Response(JSON.stringify({ error: "Restricción solapada en fechas" }), {
				status: 409,
			})
		}
	}

	await deps.repo.updateRestriction({
		ruleId,
		patch: {
			...(type && { type }),
			...(value !== undefined && { value }),
			...(fromISO && { startDate: fromISO }),
			...(toISO && { endDate: toISO }),
			...(validDays !== undefined && { validDays }),
			...(isActive !== undefined && { isActive }),
			...(scope && { scope }),
			...(scopeId !== undefined && { scopeId }),
		},
	})

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
