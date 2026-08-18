import type { WorkspaceExperience } from "@/lib/providerUserWorkspacePreference"

export type ProviderWorkspaceMetrics = {
	ratePlanCount: number
	variantCount: number
	activePriceRuleCount: number
	activeRestrictionCount: number
}

export type ProviderWorkspaceCapabilities = {
	canUseProfessionalExperience: boolean
	requiresProfessionalExperience: boolean
	canUseMultiCalendar: boolean
	canUseBulkOperations: boolean
}

export type WorkspaceExperienceResolution = {
	preference: WorkspaceExperience
	effective: WorkspaceExperience
	source: "preference" | "enterprise-scale" | "role"
	lockedReason: string | null
}

export const WORKSPACE_CAPABILITY_THRESHOLDS = {
	ratePlans: 10,
	variants: 8,
	activePriceRules: 5,
	activeRestrictions: 5,
} as const

export function resolveProviderWorkspaceCapabilities(
	metrics: ProviderWorkspaceMetrics
): ProviderWorkspaceCapabilities {
	const requiresProfessionalExperience =
		metrics.ratePlanCount >= WORKSPACE_CAPABILITY_THRESHOLDS.ratePlans ||
		metrics.variantCount >= WORKSPACE_CAPABILITY_THRESHOLDS.variants ||
		metrics.activePriceRuleCount >= WORKSPACE_CAPABILITY_THRESHOLDS.activePriceRules ||
		metrics.activeRestrictionCount >= WORKSPACE_CAPABILITY_THRESHOLDS.activeRestrictions

	return {
		canUseProfessionalExperience: true,
		requiresProfessionalExperience,
		canUseMultiCalendar: requiresProfessionalExperience,
		canUseBulkOperations: requiresProfessionalExperience,
	}
}

export function resolveWorkspaceExperience(params: {
	preference: WorkspaceExperience
	providerRole?: string | null
	capabilities: ProviderWorkspaceCapabilities
}): WorkspaceExperienceResolution {
	const role = String(params.providerRole ?? "")
		.trim()
		.toLowerCase()
	if (["internal_admin", "revenue_ops", "admin", "operations_manager"].includes(role)) {
		return {
			preference: params.preference,
			effective: "professional",
			source: "role",
			lockedReason:
				role === "revenue_ops"
					? "Vista profesional disponible por tu rol de revenue."
					: role === "internal_admin"
						? "Vista profesional disponible por tu rol interno."
						: "Vista profesional disponible por tu rol operativo.",
		}
	}

	if (params.capabilities.requiresProfessionalExperience) {
		return {
			preference: params.preference,
			effective: "professional",
			source: "enterprise-scale",
			lockedReason: "Vista profesional activada por la escala operativa de esta cuenta.",
		}
	}

	return {
		preference: params.preference,
		effective: params.preference,
		source: "preference",
		lockedReason: null,
	}
}
