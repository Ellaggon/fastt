import { isProviderDocumentExpired } from "@/lib/provider-document-validity"
import {
	diagnoseVerificationEvidence,
	normalizeVerificationEvidence,
} from "@/lib/verification/evidence-diagnosis"

export type CommercialCapability =
	| "publish"
	| "booking"
	| "collect_payment"
	| "payout"
	| "integrations"
export type JurisdictionRole = "holder" | "tax" | "payout" | "product"
export type CommercialPolicyContext = {
	holderType: "persona_natural" | "entidad"
	holderCountry: string
	taxCountry: string | null
	payoutCountry: string | null
	productCountry: string
	vertical: "hotel" | "tour" | "whole_home"
	collectionModel: "property_collect" | "platform_collect" | "undecided"
	productId?: string | null
	jurisdictionCode?: string | null
	operatingRole?: "operator" | "guide" | "intermediary" | null
	activityClasses?: string[]
	resourceIds?: string[]
	subjectReferences?: string[]
}
export type CommercialEvidenceScope = {
	scopeType: "product" | "resource" | "territory" | "activity"
	productId?: string | null
	resourceId?: string | null
	territoryCode?: string | null
	activityClass?: string | null
}
export type CommercialEvidence = {
	id: string
	type: string
	status: "pending" | "verified" | "rejected" | "superseded"
	expiresAt?: Date | null
	subjectType?: "provider" | "legal_entity" | "person" | "resource" | "third_party" | null
	subjectReference?: string | null
	scopes?: CommercialEvidenceScope[]
}
export type CommercialRequirementCondition = {
	operatingRoles?: string[]
	activityClasses?: string[]
	jurisdictionCodes?: string[]
	resourceIds?: string[]
	subjectReferences?: string[]
	/** Provider-wide evidence is valid only when the signed policy says so. */
	evidenceScope?: "provider" | "product" | "operation"
}
export type CommercialPolicyRequirement = {
	key: string
	capabilities: CommercialCapability[]
	acceptedEvidence: string[]
	required: boolean
	blockingAction: string
	reviewOwner: string
	sourceKind?: "legal" | "contract" | "fastt_policy" | null
	sourceReference?: string | null
	sourceCheckedAt?: Date | null
	condition?: CommercialRequirementCondition | null
}
export type CommercialPolicyContextSelector = Pick<
	CommercialRequirementCondition,
	"operatingRoles" | "activityClasses" | "jurisdictionCodes"
>
export type CommercialPolicyApprovalArea = "policy" | "finance" | "tour_operations"
export type CommercialPolicyApproval = {
	approvalArea: CommercialPolicyApprovalArea
	approverUserId: string
	approvalReference: string
	approvedAt: Date
}
export type CommercialPolicyVersion = {
	id: string
	jurisdictionRole: JurisdictionRole
	country: string
	vertical: CommercialPolicyContext["vertical"]
	holderType: CommercialPolicyContext["holderType"]
	collectionModel: CommercialPolicyContext["collectionModel"]
	status: "draft" | "published" | "retired"
	effectiveFrom: Date
	effectiveTo: Date | null
	approvedBy: string | null
	approvedAt: Date | null
	approvalReference: string | null
	/** Mandatory for tours: role, activity and jurisdiction covered by this version. */
	context: CommercialPolicyContextSelector | null
	signatures: CommercialPolicyApproval[]
	requirements: CommercialPolicyRequirement[]
}
export type CommercialPolicyBlocker = {
	id: string
	capabilities: CommercialCapability[]
	action: string
	policyVersionId: string | null
	evidenceState?: "missing" | "pending_review" | "rejected" | "expired" | "out_of_scope"
}
export type CommercialPolicyDiagnosis = {
	policyStatus: "supported" | "unsupported"
	capabilities: Record<CommercialCapability, boolean>
	blockers: CommercialPolicyBlocker[]
	/** Evidence already accepted for this exact context. It is explanatory only; the policy version remains authoritative. */
	satisfiedRequirements: Array<{
		key: string
		evidenceId: string
		policyVersionId: string
		/** The approved policy, not the UI, decides whether this is account reuse. */
		evidenceScope?: "provider" | "product" | "operation"
	}>
	policyVersionIds: string[]
	capabilityStates: Record<CommercialCapability, "allowed" | "blocked" | "not_applicable">
}

const allCapabilities: CommercialCapability[] = [
	"publish",
	"booking",
	"collect_payment",
	"payout",
	"integrations",
]

function requirementApplies(
	condition: CommercialRequirementCondition | null | undefined,
	context: CommercialPolicyContext
) {
	if (!condition) return true
	if (
		condition.operatingRoles?.length &&
		(!context.operatingRole || !condition.operatingRoles.includes(context.operatingRole))
	)
		return false
	if (
		condition.activityClasses?.length &&
		(!context.activityClasses?.length ||
			!condition.activityClasses.some((value) => context.activityClasses?.includes(value)))
	)
		return false
	if (
		condition.jurisdictionCodes?.length &&
		(!context.jurisdictionCode || !condition.jurisdictionCodes.includes(context.jurisdictionCode))
	)
		return false
	if (
		condition.resourceIds?.length &&
		(!context.resourceIds?.length ||
			!condition.resourceIds.some((value) => context.resourceIds?.includes(value)))
	)
		return false
	if (
		condition.subjectReferences?.length &&
		(!context.subjectReferences?.length ||
			!condition.subjectReferences.some((value) => context.subjectReferences?.includes(value)))
	)
		return false
	return true
}

export const requiredTourApprovalAreas: CommercialPolicyApprovalArea[] = [
	"policy",
	"finance",
	"tour_operations",
]

function versionMatchesContext(version: CommercialPolicyVersion, context: CommercialPolicyContext) {
	if (version.vertical !== "tour") return true
	const selector = version.context
	if (
		!selector?.operatingRoles?.length ||
		!selector.activityClasses?.length ||
		!selector.jurisdictionCodes?.length
	)
		return false
	return requirementApplies(selector, context)
}

export function hasRequiredTourApprovals(version: CommercialPolicyVersion): boolean {
	if (version.vertical !== "tour") return true
	const signedAreas = new Set(
		version.signatures
			.filter(
				(signature) =>
					Boolean(signature.approverUserId) &&
					Boolean(signature.approvalReference) &&
					!Number.isNaN(signature.approvedAt.getTime())
			)
			.map((signature) => signature.approvalArea)
	)
	return requiredTourApprovalAreas.every((area) => signedAreas.has(area))
}

/**
 * A tour version is publishable only when its commercial decision is auditable.
 * This deliberately does not infer a source or a reviewer from the vertical.
 */
export function tourPolicyPublicationErrors(version: CommercialPolicyVersion): string[] {
	if (version.vertical !== "tour") return []
	const errors: string[] = []
	if (
		!versionMatchesContext(version, {
			holderType: version.holderType,
			holderCountry: version.country,
			taxCountry: null,
			payoutCountry: null,
			productCountry: version.country,
			vertical: "tour",
			collectionModel: version.collectionModel,
			operatingRole: version.context
				?.operatingRoles?.[0] as CommercialPolicyContext["operatingRole"],
			activityClasses: version.context?.activityClasses,
			jurisdictionCode: version.context?.jurisdictionCodes?.[0],
		})
	) {
		errors.push("tour_policy_context_incomplete")
	}
	if (!hasRequiredTourApprovals(version)) errors.push("tour_policy_signatures_incomplete")
	if (!version.approvedBy || !version.approvedAt || !version.approvalReference) {
		errors.push("tour_policy_approval_metadata_missing")
	}
	for (const requirement of version.requirements.filter((item) => item.required)) {
		if (!requirement.acceptedEvidence.length)
			errors.push(`requirement_${requirement.key}_evidence_missing`)
		if (!requirement.capabilities.length)
			errors.push(`requirement_${requirement.key}_capability_missing`)
		if (!requirement.reviewOwner) errors.push(`requirement_${requirement.key}_reviewer_missing`)
		if (!requirement.blockingAction) errors.push(`requirement_${requirement.key}_action_missing`)
		if (!requirement.sourceKind || !requirement.sourceReference || !requirement.sourceCheckedAt) {
			errors.push(`requirement_${requirement.key}_source_missing`)
		}
	}
	return errors
}

function evidenceAppliesToContext(
	evidence: CommercialEvidence,
	context: CommercialPolicyContext,
	at: Date,
	evidenceScope: CommercialRequirementCondition["evidenceScope"]
) {
	if (isProviderDocumentExpired(evidence.expiresAt, at)) return "expired" as const
	if (evidence.subjectReference && !context.subjectReferences?.includes(evidence.subjectReference))
		return "out_of_scope" as const
	if (context.vertical === "tour" && evidence.type === "operating_license") {
		const role = context.operatingRole
		const diagnosis = diagnoseVerificationEvidence({
			requirement: {
				id: role === "guide" ? "tour.guide_credential" : "tour.operator_license",
				layer: "tour",
				documentType: "operating_license",
			},
			evidence: normalizeVerificationEvidence([evidence]),
			operation: {
				productId: context.productId,
				resourceId: context.resourceIds?.length === 1 ? context.resourceIds[0] : null,
				territoryCodes: [context.jurisdictionCode, context.productCountry].filter(
					(value): value is string => Boolean(value)
				),
				activityClasses: (context.activityClasses ?? []) as Array<
					| "urban_cultural"
					| "guided_nature"
					| "adventure"
					| "transport"
					| "water_air"
					| "gastronomic"
				>,
				subjectReferences: context.subjectReferences,
				at,
			},
		})
		if (diagnosis.state !== "ready") return "out_of_scope" as const
	}
	const scopes = evidence.scopes ?? []
	// Legacy evidence without a recorded scope remains historical. It can only
	// satisfy a requirement when the approved policy explicitly permits a
	// provider-wide document (for example, a holder identity document).
	if (evidenceScope !== "provider" && scopes.length === 0) return "out_of_scope" as const
	const byType = (scopeType: CommercialEvidenceScope["scopeType"]) =>
		scopes.filter((scope) => scope.scopeType === scopeType)
	const productScopes = byType("product")
	if (productScopes.length && !productScopes.some((scope) => scope.productId === context.productId))
		return "out_of_scope" as const
	const resourceScopes =
		context.vertical === "tour" && !context.resourceIds?.length ? [] : byType("resource")
	if (
		resourceScopes.length &&
		!resourceScopes.some((scope) => context.resourceIds?.includes(String(scope.resourceId ?? "")))
	)
		return "out_of_scope" as const
	const territoryScopes = byType("territory")
	if (
		territoryScopes.length &&
		!territoryScopes.some((scope) => {
			const territory = String(scope.territoryCode ?? "")
			return territory === context.jurisdictionCode || territory === context.productCountry
		})
	)
		return "out_of_scope" as const
	const activityScopes = byType("activity")
	if (
		activityScopes.length &&
		!activityScopes.some((scope) =>
			context.activityClasses?.includes(String(scope.activityClass ?? ""))
		)
	)
		return "out_of_scope" as const
	return null
}

function evidenceFailureState(
	evidence: CommercialEvidence[],
	context: CommercialPolicyContext,
	at: Date,
	evidenceScope: CommercialRequirementCondition["evidenceScope"]
): CommercialPolicyBlocker["evidenceState"] {
	const scoped = evidence.filter(
		(item) => evidenceAppliesToContext(item, context, at, evidenceScope) === null
	)
	if (scoped.some((item) => item.status === "pending")) return "pending_review"
	if (scoped.some((item) => item.status === "rejected")) return "rejected"
	if (
		evidence.some(
			(item) =>
				item.status === "verified" &&
				evidenceAppliesToContext(item, context, at, evidenceScope) === "expired"
		)
	)
		return "expired"
	return evidence.length ? "out_of_scope" : "missing"
}

/** Fail closed on absent, conflicting or unapproved legal/operational annexes. */
export function evaluateCommercialPolicy(input: {
	context: CommercialPolicyContext
	versions: CommercialPolicyVersion[]
	/** Kept for existing callers; structured evidence is authoritative when present. */
	verifiedEvidence?: string[]
	evidence?: CommercialEvidence[]
	now?: Date
}): CommercialPolicyDiagnosis {
	const now = input.now ?? new Date()
	const countries: Partial<Record<JurisdictionRole, string | null>> = {
		holder: input.context.holderCountry,
		product: input.context.productCountry,
		tax: input.context.taxCountry,
		payout: input.context.payoutCountry,
	}
	const roles: JurisdictionRole[] =
		input.context.collectionModel === "platform_collect"
			? ["holder", "product", "tax", "payout"]
			: ["holder", "product", "tax"]
	const blockers: CommercialPolicyBlocker[] = []
	const satisfiedRequirements: CommercialPolicyDiagnosis["satisfiedRequirements"] = []
	const selected: CommercialPolicyVersion[] = []
	for (const role of roles) {
		const country = countries[role]
		if (!country) {
			blockers.push({
				id: `policy_context_missing_${role}`,
				capabilities: allCapabilities,
				action: "Completa la jurisdicción aplicable.",
				policyVersionId: null,
			})
			continue
		}
		const matching = input.versions.filter(
			(row) =>
				row.jurisdictionRole === role &&
				row.country === country &&
				row.vertical === input.context.vertical &&
				row.holderType === input.context.holderType &&
				row.collectionModel === input.context.collectionModel &&
				row.status === "published" &&
				Boolean(row.approvedBy && row.approvedAt && row.approvalReference) &&
				tourPolicyPublicationErrors(row).length === 0 &&
				versionMatchesContext(row, input.context) &&
				row.effectiveFrom <= now &&
				(!row.effectiveTo || row.effectiveTo > now)
		)
		if (matching.length !== 1) {
			blockers.push({
				id: matching.length
					? `policy_context_conflict_${role}`
					: `policy_context_unsupported_${role}`,
				capabilities: allCapabilities,
				action: "Solicita revisión de políticas para esta combinación.",
				policyVersionId: null,
			})
			continue
		}
		if (matching[0].requirements.length === 0) {
			blockers.push({
				id: `policy_contract_empty_${role}`,
				capabilities: allCapabilities,
				action: "La versión aprobada no define requisitos comerciales.",
				policyVersionId: matching[0].id,
			})
		}
		selected.push(matching[0])
	}
	if (input.context.collectionModel === "undecided") {
		blockers.push({
			id: "collection_model_undecided",
			capabilities: ["collect_payment", "payout"],
			action: "Confirma quién cobra y a quién se paga.",
			policyVersionId: null,
		})
	}
	const evidence =
		input.evidence ??
		(input.verifiedEvidence ?? []).map(
			(type, index): CommercialEvidence => ({
				id: `legacy:${index}:${type}`,
				type,
				status: "verified",
				scopes: [],
			})
		)
	for (const version of selected) {
		for (const requirement of version.requirements) {
			if (!requirement.required || !requirementApplies(requirement.condition, input.context))
				continue
			const accepted = evidence.filter((item) => requirement.acceptedEvidence.includes(item.type))
			const evidenceScope = requirement.condition?.evidenceScope ?? "product"
			const applicable = accepted.find(
				(item) =>
					item.status === "verified" &&
					!evidenceAppliesToContext(item, input.context, now, evidenceScope)
			)
			if (!applicable) {
				blockers.push({
					id: `requirement_${requirement.key}`,
					capabilities: requirement.capabilities,
					action: requirement.blockingAction,
					policyVersionId: version.id,
					evidenceState: evidenceFailureState(accepted, input.context, now, evidenceScope),
				})
			} else {
				satisfiedRequirements.push({
					key: requirement.key,
					evidenceId: applicable.id,
					policyVersionId: version.id,
					evidenceScope,
				})
			}
		}
	}
	const capabilityStates = Object.fromEntries(
		allCapabilities.map((capability) => {
			const notApplicable =
				input.context.collectionModel === "property_collect" &&
				(capability === "collect_payment" || capability === "payout")
			return [
				capability,
				notApplicable
					? "not_applicable"
					: blockers.some((blocker) => blocker.capabilities.includes(capability))
						? "blocked"
						: "allowed",
			]
		})
	) as CommercialPolicyDiagnosis["capabilityStates"]
	return {
		policyStatus: blockers.some(
			(row) => row.id.startsWith("policy_context_") || row.id.startsWith("policy_contract_")
		)
			? "unsupported"
			: "supported",
		capabilities: Object.fromEntries(
			allCapabilities.map((capability) => [capability, capabilityStates[capability] === "allowed"])
		) as Record<CommercialCapability, boolean>,
		blockers,
		satisfiedRequirements,
		policyVersionIds: selected.map((row) => row.id),
		capabilityStates,
	}
}
