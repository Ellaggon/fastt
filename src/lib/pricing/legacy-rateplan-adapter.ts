import { variantManagementRepository } from "@/container"

export type LegacyAdapterWarning = {
	code: "pricing_legacy_variant_adapter_used"
	severity: "warning"
}

export async function resolveRatePlanIdFromLegacyInput(params: {
	ratePlanId?: string | null
	variantId?: string | null
}): Promise<{ ratePlanId: string | null; warning: LegacyAdapterWarning | null }> {
	const explicitRatePlanId = String(params.ratePlanId ?? "").trim()
	if (explicitRatePlanId) {
		return { ratePlanId: explicitRatePlanId, warning: null }
	}

	const variantId = String(params.variantId ?? "").trim()
	if (!variantId) {
		return { ratePlanId: null, warning: null }
	}

	const compat = await variantManagementRepository.getDefaultRatePlanWithRules(variantId)
	const resolvedRatePlanId = String(compat?.ratePlanId ?? "").trim()
	if (!resolvedRatePlanId) {
		return { ratePlanId: null, warning: null }
	}

	return {
		ratePlanId: resolvedRatePlanId,
		warning: {
			code: "pricing_legacy_variant_adapter_used",
			severity: "warning",
		},
	}
}
