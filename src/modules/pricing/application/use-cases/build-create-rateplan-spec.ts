export type CreateRatePlanValidationError =
	| { code: "INVALID_PERCENTAGE"; message: "Invalid percentage" }
	| { code: "INVALID_OVERRIDE"; message: "Override price must be greater than zero" }

export interface CreateRatePlanSpec {
	// Keep this use-case framework/infrastructure-agnostic:
	// - no DB calls
	// - no timestamp generation (preserve route behavior)
	// - only validation + derived restriction items
	restrictions: {
		items: Array<{ type: any; value: number }>
	}
}

export function buildCreateRatePlanSpec(
	body: any
): { ok: true; spec: CreateRatePlanSpec } | { ok: false; error: CreateRatePlanValidationError } {
	// Preserve existing endpoint validation semantics exactly.
	if (
		(body?.type === "percentage_discount" || body?.type === "percentage_markup") &&
		(body?.value < 0 || body?.value > 100)
	) {
		return {
			ok: false,
			error: { code: "INVALID_PERCENTAGE", message: "Invalid percentage" },
		}
	}

	if (body?.type === "override" && body?.value <= 0) {
		return {
			ok: false,
			error: { code: "INVALID_OVERRIDE", message: "Override price must be greater than zero" },
		}
	}

	const restrictionItems: Array<{ type: any; value: number }> = []

	if (body?.minNights && body.minNights > 1) {
		restrictionItems.push({ type: "min_los", value: Number(body.minNights) })
	}

	if (body?.maxNights) {
		restrictionItems.push({ type: "max_los", value: Number(body.maxNights) })
	}

	if (body?.minAdvanceDays && body.minAdvanceDays > 0) {
		restrictionItems.push({ type: "min_lead_time", value: Number(body.minAdvanceDays) })
	}

	if (body?.maxAdvanceDays) {
		restrictionItems.push({ type: "max_lead_time", value: Number(body.maxAdvanceDays) })
	}

	return {
		ok: true,
		spec: {
			restrictions: {
				items: restrictionItems,
			},
		},
	}
}
