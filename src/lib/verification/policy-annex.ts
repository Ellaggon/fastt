/**
 * Phase 6 — one annex per commercial line.
 *
 * A line is an identifier, a pack and an annex. Lodging records the rules
 * already enforced in production. New tour documents stay withheld until
 * Policy, Finance and Tours Operations sign the Bolivia annex. A line without
 * an annex does not borrow another line's pack.
 *
 * Representative power (`shared.representative_power`) stays in
 * `withheldRequirementIds` until that signature; do not add uploads or resolver
 * rows before the annex moves to production.
 */

import {
	commercialLineForProductType,
	type CommercialLine,
} from "@/lib/verification/commercial-lines"

export type PolicyAnnexStatus = "in_production" | "awaiting_signature"

export type PolicyAnnex = {
	lineId: CommercialLine
	annexId: string
	status: PolicyAnnexStatus
	owner: string
	requiredSigners: readonly string[]
	signedBy: readonly string[]
	enforcedRequirementIds: readonly string[]
	withheldRequirementIds: readonly string[]
}

const sharedProductionIds = [
	"shared.identity",
	"shared.operations",
	"shared.verification",
	"shared.fiscality",
	"shared.team",
	"shared.government_id",
	"shared.business_registration",
	"shared.payout_account",
] as const

export const lodgingPolicyAnnex = {
	lineId: "lodging",
	annexId: "annex.lodging.production",
	status: "in_production",
	owner: "Provider Policy",
	requiredSigners: [],
	signedBy: [],
	enforcedRequirementIds: [
		...sharedProductionIds,
		"lodging.ownership_proof",
		"lodging.establishment_license",
	],
	withheldRequirementIds: [],
} as const satisfies PolicyAnnex

export const tourPolicyAnnex = {
	lineId: "tour",
	annexId: "annex.tour.bo.v1",
	status: "awaiting_signature",
	owner: "Provider Policy / Finance / Tours Operations",
	requiredSigners: ["Políticas", "Finanzas", "Operaciones Tours"],
	signedBy: [],
	enforcedRequirementIds: [
		...sharedProductionIds,
		"tour.guide_credential",
		"tour.operator_license",
		"tour.insurance",
		"tour.context_missing",
		"tour.operating_role_missing",
		"tour.food_handling_pending",
		"departure.guide",
		"departure.vehicle",
		"departure.permit",
		"departure.insurance",
	],
	withheldRequirementIds: [
		"shared.representative_power",
		"tour.protected_area_permit",
		"tour.food_handling_document",
		"tour.vehicle_habilitation",
	],
} as const satisfies PolicyAnnex

/** Matriz tours BO v1 — poder del representante; no implementar antes de firma del anexo. */
export const representativePowerRequirementId = "shared.representative_power" as const

const annexes = [lodgingPolicyAnnex, tourPolicyAnnex] as const

export function policyAnnexForLine(line: string | null | undefined): PolicyAnnex | null {
	return annexes.find((annex) => annex.lineId === line) ?? null
}

export function policyAnnexForProductType(productType: unknown): PolicyAnnex | null {
	return policyAnnexForLine(commercialLineForProductType(productType))
}

export function annexIsSigned(annex: PolicyAnnex): boolean {
	return annex.requiredSigners.every((signer) => annex.signedBy.includes(signer))
}

/** Only the annex allowlist can be enforced. A new id stays out until that annex lists it. */
export function mayEnforceRequirement(line: CommercialLine | null, requirementId: string): boolean {
	if (
		line === "tour" &&
		tourPolicyAnnex.withheldRequirementIds.some((id) => id === requirementId) &&
		!annexIsSigned(tourPolicyAnnex)
	) {
		return false
	}
	if (requirementId.startsWith("shared.")) return true
	const annex = policyAnnexForLine(line)
	if (!annex) return false
	if (annex.withheldRequirementIds.includes(requirementId) && !annexIsSigned(annex)) return false
	return annex.enforcedRequirementIds.includes(requirementId)
}
