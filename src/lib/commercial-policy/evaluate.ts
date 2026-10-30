import { isProviderDocumentExpired } from "@/lib/provider-document-validity"
import { composePolicyVersions, compositionSchema, type PolicyComposition } from "./composition"
import {
	evaluateDocumentAcceptance,
	type DocumentAcceptance,
} from "@/shared/domain/document-acceptance"
import { isExperienceFormat, type ExperienceFormat } from "@/shared/domain/experience-format"
import type { TourOperation } from "@/shared/domain/tour-operation"
import {
	allTerritoriesCovered,
	territoryIsCovered,
	type TerritoryAncestors,
} from "@/shared/domain/territorial-coverage"
import type { ProviderDocumentActivityClass } from "@/lib/provider-documents"
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
	providerId?: string
	evidenceSubjects?: Partial<Record<"holder" | "guides" | "operator" | "resources", string[]>>
	experienceFormat?: ExperienceFormat | null
	formatContractVersion?: number
	holderType: "persona_natural" | "entidad"
	holderCountry: string
	legalFormCode?: string | null
	operation?: TourOperation | null
	taxCountry: string | null
	payoutCountry: string | null
	productCountry: string
	vertical: "hotel" | "tour" | "whole_home"
	collectionModel: "property_collect" | "platform_collect" | "undecided"
	productId?: string | null
	jurisdictionCode?: string | null
	jurisdictionCodes?: string[]
	territoryAncestors?: TerritoryAncestors
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
	definitionVersionId?: string | null
	type: string
	status: "pending" | "verified" | "rejected" | "superseded"
	expiresAt?: Date | null
	subjectType?: "provider" | "legal_entity" | "person" | "resource" | "third_party" | null
	subjectReference?: string | null
	scopes?: CommercialEvidenceScope[]
}
export type CommercialRequirementCondition = {
	evidenceSubjectSelector?: "holder" | "guides" | "operator" | "resources"
	legalFormCodes?: string[]
	executionModes?: string[]
	foodHandlingModes?: string[]
	transportProviders?: string[]
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
	documentAcceptance?: DocumentAcceptance | null
	/** All named subjects must independently satisfy a complete alternative. */
	requiredSubjectReferences?: string[]
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
	| "operatingRoles"
	| "activityClasses"
	| "jurisdictionCodes"
	| "legalFormCodes"
	| "executionModes"
	| "foodHandlingModes"
	| "transportProviders"
> & {
	contextVersion?: number
	experienceFormats?: ExperienceFormat[]
	composition?: PolicyComposition
}
export type CommercialPolicyApprovalArea = "policy" | "finance" | "tour_operations"
export type CommercialPolicyApproval = {
	approvalArea: CommercialPolicyApprovalArea
	approverUserId: string
	approvalReference: string
	approvedAt: Date
}
export type CommercialPolicyVersion = {
	id: string
	policySetId?: string
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
	/** Explains configuration failures without changing capability enforcement. */
	configurationReason?:
		| "missing"
		| "draft"
		| "retired"
		| "expired"
		| "future"
		| "approval_missing"
		| "incompatible"
		| "conflict"
	evidenceState?: "missing" | "pending_review" | "rejected" | "expired" | "out_of_scope"
}
export type CommercialPolicyDiagnosis = {
	/** Explanatory data only; commands must reevaluate current facts. */
	evaluation?: {
		contractVersion: 1
		evaluatedAt: string
		coverage?: {
			state: "covered" | "partial" | "unknown"
			coveredTerritoryIds: string[]
			pendingTerritoryIds: string[]
		}
		requirements: Array<{
			identity: string
			policyVersionId: string
			key: string
			territoryIds: string[]
			package: ReturnType<typeof evaluateDocumentAcceptance> | null
		}>
	}
	policyStatus: "supported" | "unsupported"
	capabilities: Record<CommercialCapability, boolean>
	blockers: CommercialPolicyBlocker[]
	/** Evidence already accepted for this exact context. It is explanatory only; the policy version remains authoritative. */
	satisfiedRequirements: Array<{
		key: string
		evidenceId: string
		evidenceIds?: string[]
		policyVersionId: string
		/** The approved policy, not the UI, decides whether this is account reuse. */
		evidenceScope?: "provider" | "product" | "operation"
	}>
	policyVersionIds: string[]
	compositionTrace?: Array<
		{ jurisdictionRole: JurisdictionRole; territoryId?: string } & ReturnType<
			typeof composePolicyVersions
		>
	>
	/** Presentation consumes the same required evidence selected by this evaluation. */
	applicableRequirements?: Array<CommercialPolicyRequirement & { policyVersionId: string }>
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
		condition.legalFormCodes?.length &&
		(!context.legalFormCode || !condition.legalFormCodes.includes(context.legalFormCode))
	)
		return false
	if (
		condition.executionModes?.length &&
		(!context.operation || !condition.executionModes.includes(context.operation.executionMode))
	)
		return false
	if (
		condition.foodHandlingModes?.length &&
		(!context.operation || !condition.foodHandlingModes.includes(context.operation.foodHandling))
	)
		return false
	if (
		condition.transportProviders?.length &&
		!context.operation?.transportServices.some((service) =>
			condition.transportProviders?.includes(service.providedBy)
		)
	)
		return false
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
		!(
			context.jurisdictionCodes ?? (context.jurisdictionCode ? [context.jurisdictionCode] : [])
		).some((code) =>
			territoryIsCovered(code, condition.jurisdictionCodes ?? [], context.territoryAncestors)
		)
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

function versionMatchesContext(
	version: CommercialPolicyVersion,
	context: CommercialPolicyContext,
	validateSelectorOnly = false
) {
	if (version.vertical !== "tour") return true
	const selector = version.context
	if (
		selector?.experienceFormats?.length &&
		selector.contextVersion !== 2 &&
		selector.contextVersion !== 3
	)
		return false
	if (selector?.contextVersion === 2 || selector?.contextVersion === 3) {
		if (selector.contextVersion === 3 && !selector.composition) return false
		if (
			!isExperienceFormat(context.experienceFormat) ||
			!selector.experienceFormats?.includes(context.experienceFormat)
		)
			return false
	} else {
		if (selector?.contextVersion !== undefined && selector.contextVersion !== 1) return false
		// Unversioned approvals describe the historical tour contract only.
		if (context.experienceFormat != null && context.experienceFormat !== "guided_tour") return false
		if (context.experienceFormat == null && (context.formatContractVersion ?? 0) !== 0) return false
	}
	if (
		!selector?.operatingRoles?.length ||
		!selector.activityClasses?.length ||
		!selector.jurisdictionCodes?.length
	)
		return false
	if (
		selector.contextVersion !== 3 &&
		context.jurisdictionCodes?.length &&
		!allTerritoriesCovered(
			context.jurisdictionCodes,
			selector.jurisdictionCodes,
			context.territoryAncestors
		)
	)
		return false
	// A normalized declaration must not gain coverage through just one benign activity.
	if (
		context.operation &&
		!(selector.contextVersion === 3 && selector.composition?.kind === "requirements") &&
		context.activityClasses?.some((activity) => !selector.activityClasses?.includes(activity))
	)
		return false
	return requirementApplies(
		validateSelectorOnly
			? {
					operatingRoles: selector.operatingRoles,
					activityClasses: selector.activityClasses,
					jurisdictionCodes: selector.jurisdictionCodes,
				}
			: selector,
		context
	)
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
		version.context?.contextVersion === 3 &&
		!compositionSchema.safeParse(version.context.composition).success
	)
		errors.push("policy_composition_invalid")
	if (
		(version.context?.contextVersion === 2 || version.context?.contextVersion === 3) &&
		(!version.context.experienceFormats?.length ||
			!version.context.experienceFormats.every(isExperienceFormat))
	)
		errors.push("experience_policy_formats_incomplete")
	if (
		!versionMatchesContext(
			version,
			{
				holderType: version.holderType,
				holderCountry: version.country,
				taxCountry: null,
				payoutCountry: null,
				productCountry: version.country,
				vertical: "tour",
				collectionModel: version.collectionModel,
				experienceFormat: version.context?.experienceFormats?.[0],
				operatingRole: version.context
					?.operatingRoles?.[0] as CommercialPolicyContext["operatingRole"],
				activityClasses: version.context?.activityClasses,
				jurisdictionCode: version.context?.jurisdictionCodes?.[0],
			},
			true
		)
	) {
		errors.push("tour_policy_context_incomplete")
	}
	if (!hasRequiredTourApprovals(version)) errors.push("tour_policy_signatures_incomplete")
	if (!version.approvedBy || !version.approvedAt || !version.approvalReference) {
		errors.push("tour_policy_approval_metadata_missing")
	}
	for (const requirement of version.requirements.filter((item) => item.required)) {
		if (!requirement.acceptedEvidence.length && !requirement.documentAcceptance)
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
				territoryAncestors: context.territoryAncestors,
				productId: context.productId,
				operatorResourceId: context.operation?.operatorResourceId,
				requireAllActivityScopes: Boolean(context.operation),
				resourceId: context.resourceIds?.length === 1 ? context.resourceIds[0] : null,
				territoryCodes: (context.jurisdictionCodes?.length
					? context.jurisdictionCodes
					: [context.jurisdictionCode ?? context.productCountry]
				).filter((value): value is string => Boolean(value)),
				activityClasses: (context.activityClasses ?? []) as ProviderDocumentActivityClass[],
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
		context.jurisdictionCodes?.length &&
		!allTerritoriesCovered(
			context.jurisdictionCodes,
			territoryScopes.map((scope) => scope.territoryCode ?? ""),
			context.territoryAncestors
		)
	)
		return "out_of_scope" as const
	if (
		territoryScopes.length &&
		!allTerritoriesCovered(
			context.jurisdictionCodes ?? (context.jurisdictionCode ? [context.jurisdictionCode] : []),
			territoryScopes.map((scope) => scope.territoryCode ?? ""),
			context.territoryAncestors
		)
	)
		return "out_of_scope" as const
	const activityScopes = byType("activity")
	if (
		context.operation &&
		activityScopes.length &&
		context.activityClasses?.some(
			(activity) => !activityScopes.some((scope) => scope.activityClass === activity)
		)
	)
		return "out_of_scope" as const
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
	const requirementResults: NonNullable<CommercialPolicyDiagnosis["evaluation"]>["requirements"] =
		[]
	const selected: CommercialPolicyVersion[] = []
	const selectedTerritories = new Map<string, Set<string>>()
	const versionContext = (version: CommercialPolicyVersion): CommercialPolicyContext => {
		const territories = selectedTerritories.get(version.id)
		if (!territories?.size) return input.context
		return {
			...input.context,
			jurisdictionCodes: [...territories],
			jurisdictionCode: [...territories][0],
			activityClasses:
				version.context?.composition?.kind === "requirements"
					? input.context.activityClasses?.filter((activity) =>
							version.context?.activityClasses?.includes(activity)
						)
					: input.context.activityClasses,
		}
	}
	const compositionTrace: NonNullable<CommercialPolicyDiagnosis["compositionTrace"]> = []
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
		if (matching.some((row) => row.context?.contextVersion === 3)) {
			if (matching.some((row) => row.context?.contextVersion !== 3)) {
				blockers.push({
					id: `policy_context_conflict_${role}`,
					capabilities: allCapabilities,
					action: "Fastt debe resolver la coexistencia de contratos históricos y componibles.",
					policyVersionId: null,
					configurationReason: "conflict",
				})
				continue
			}
			const referenceVersions = input.versions.filter(
				(row) =>
					row.jurisdictionRole === role &&
					row.country === country &&
					row.vertical === input.context.vertical &&
					row.holderType === input.context.holderType &&
					row.collectionModel === input.context.collectionModel &&
					row.context?.contextVersion === 3 &&
					row.status !== "draft" &&
					tourPolicyPublicationErrors(row).length === 0
			)
			const territories = input.context.jurisdictionCodes?.length
				? input.context.jurisdictionCodes
				: [input.context.jurisdictionCode ?? ""]
			for (const territoryId of territories) {
				const scoped = matching.filter((row) =>
					versionMatchesContext(row, {
						...input.context,
						jurisdictionCodes: [territoryId],
						jurisdictionCode: territoryId,
					})
				)
				const composition = composePolicyVersions(
					scoped.map((row) => ({
						id: row.id,
						policySetId: row.policySetId,
						composition: row.context!.composition!,
					})),
					referenceVersions.map((row) => ({
						id: row.id,
						policySetId: row.policySetId,
						composition: row.context!.composition!,
					})),
					referenceVersions
						.filter(
							(row) =>
								row.effectiveFrom <= now &&
								versionMatchesContext(row, {
									...input.context,
									jurisdictionCodes: [territoryId],
									jurisdictionCode: territoryId,
								})
						)
						.map((row) => ({
							id: row.id,
							policySetId: row.policySetId,
							composition: row.context!.composition!,
						}))
				)
				compositionTrace.push({ jurisdictionRole: role, territoryId, ...composition })
				if (composition.conflicts.length || composition.missingFamilies.length) {
					blockers.push({
						id: `policy_context_${composition.conflicts.length ? "conflict" : "unsupported"}_${role}`,
						capabilities: allCapabilities,
						action: composition.conflicts.length
							? "Fastt debe resolver un conflicto entre políticas aplicables."
							: "Fastt debe completar las familias de políticas aplicables.",
						policyVersionId: null,
						configurationReason: composition.conflicts.length ? "conflict" : "missing",
					})
					continue
				}
				for (const row of scoped.filter((candidate) =>
					composition.selectedIds.includes(candidate.id)
				)) {
					if (row.context?.composition?.kind === "requirements" && !row.requirements.length)
						blockers.push({
							id: `policy_contract_empty_${role}`,
							capabilities: allCapabilities,
							action: "La familia no define requisitos aprobados.",
							policyVersionId: row.id,
						})
					if (!selected.some((candidate) => candidate.id === row.id)) selected.push(row)
					const scope = selectedTerritories.get(row.id) ?? new Set<string>()
					scope.add(territoryId)
					selectedTerritories.set(row.id, scope)
				}
			}
			continue
		}
		if (matching.length !== 1) {
			const candidates = input.versions.filter(
				(row) =>
					row.jurisdictionRole === role &&
					row.country === country &&
					row.vertical === input.context.vertical &&
					row.holderType === input.context.holderType &&
					row.collectionModel === input.context.collectionModel
			)
			const scoped = candidates.filter((row) => versionMatchesContext(row, input.context))
			const published = scoped.filter((row) => row.status === "published")
			const current = published.filter(
				(row) => row.effectiveFrom <= now && (!row.effectiveTo || row.effectiveTo > now)
			)
			const configurationReason: NonNullable<CommercialPolicyBlocker["configurationReason"]> =
				matching.length
					? "conflict"
					: !candidates.length
						? "missing"
						: !scoped.length
							? "incompatible"
							: current.length
								? "approval_missing"
								: published.some((row) => row.effectiveFrom > now)
									? "future"
									: published.length
										? "expired"
										: scoped.some((row) => row.status === "draft")
											? "draft"
											: "retired"
			blockers.push({
				configurationReason,
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
		const effectiveContext = versionContext(version)
		for (const requirement of version.requirements) {
			if (!requirement.required || !requirementApplies(requirement.condition, effectiveContext))
				continue
			const definitionIds =
				requirement.documentAcceptance?.alternatives.flatMap((alternative) =>
					alternative.allOf.map((part) => part.definitionVersionId)
				) ?? []
			const accepted = evidence
				.filter((item) =>
					requirement.documentAcceptance
						? Boolean(item.definitionVersionId && definitionIds.includes(item.definitionVersionId))
						: requirement.acceptedEvidence.includes(item.type)
				)
				.map((item) =>
					requirement.documentAcceptance &&
					["holder", "operator"].includes(requirement.condition?.evidenceSubjectSelector ?? "") &&
					(item.subjectType === "provider" || item.subjectType === "legal_entity") &&
					effectiveContext.providerId
						? { ...item, subjectReference: effectiveContext.providerId }
						: item
				)
			const evidenceScope = requirement.condition?.evidenceScope ?? "product"
			const evidenceContext =
				requirement.documentAcceptance && effectiveContext.providerId
					? {
							...effectiveContext,
							subjectReferences: [
								...new Set([
									...(effectiveContext.subjectReferences ?? []),
									effectiveContext.providerId,
								]),
							],
						}
					: effectiveContext
			const eligible = accepted.filter(
				(item) =>
					item.status === "verified" &&
					!evidenceAppliesToContext(item, evidenceContext, now, evidenceScope)
			)
			const packageResult = requirement.documentAcceptance
				? evaluateDocumentAcceptance(
						requirement.documentAcceptance,
						requirement.requiredSubjectReferences ??
							(requirement.condition?.evidenceSubjectSelector
								? (effectiveContext.evidenceSubjects?.[
										requirement.condition.evidenceSubjectSelector
									] ?? [])
								: (effectiveContext.subjectReferences ?? [])),
						eligible.map((item) => ({
							id: item.id,
							definitionVersionId: item.definitionVersionId ?? null,
							subjectId:
								(item.subjectType === "provider" || item.subjectType === "legal_entity") &&
								["holder", "operator"].includes(
									requirement.condition?.evidenceSubjectSelector ?? ""
								)
									? (effectiveContext.providerId ?? "")
									: (item.subjectReference ?? ""),
						}))
					)
				: null
			requirementResults.push({
				identity: JSON.stringify([
					version.id,
					requirement.key,
					effectiveContext.jurisdictionCodes ?? [],
				]),
				policyVersionId: version.id,
				key: requirement.key,
				territoryIds: effectiveContext.jurisdictionCodes ?? [],
				package: packageResult,
			})
			const applicable = packageResult
				? packageResult.satisfied
					? eligible[0]
					: undefined
				: eligible[0]
			if (!applicable) {
				const failure = evidenceFailureState(accepted, evidenceContext, now, evidenceScope)
				const submitted =
					requirement.documentAcceptance && packageResult
						? evaluateDocumentAcceptance(
								requirement.documentAcceptance,
								packageResult.subjects.map((subject) => subject.subjectId),
								accepted
									.filter(
										(item) =>
											(item.status === "verified" || item.status === "pending") &&
											!evidenceAppliesToContext(item, evidenceContext, now, evidenceScope)
									)
									.map((item) => ({
										id: item.id,
										definitionVersionId: item.definitionVersionId ?? null,
										subjectId: item.subjectReference ?? "",
									}))
							)
						: null
				blockers.push({
					id: `requirement_${requirement.key}`,
					capabilities: requirement.capabilities,
					action: requirement.blockingAction,
					policyVersionId: version.id,
					evidenceState: packageResult
						? submitted?.satisfied
							? "pending_review"
							: failure === "pending_review" || failure === "out_of_scope"
								? "missing"
								: failure
						: failure,
				})
			} else {
				satisfiedRequirements.push({
					key: requirement.key,
					evidenceId: applicable.id,
					...(packageResult
						? {
								evidenceIds: packageResult.subjects.flatMap(
									(subject) => subject.satisfiedBy?.evidenceIds ?? []
								),
							}
						: {}),
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
	const productTraces = compositionTrace.filter((trace) => trace.jurisdictionRole === "product")
	const coveredTerritoryIds = productTraces
		.filter((trace) => !trace.conflicts.length && !trace.missingFamilies.length)
		.flatMap((trace) => (trace.territoryId ? [trace.territoryId] : []))
	const pendingTerritoryIds = productTraces
		.filter((trace) => trace.conflicts.length || trace.missingFamilies.length)
		.flatMap((trace) => (trace.territoryId ? [trace.territoryId] : []))
	const configurationUnknown = blockers.some(
		(row) => row.id.startsWith("policy_context_") || row.id.startsWith("policy_contract_")
	)
	return {
		evaluation: {
			contractVersion: 1,
			evaluatedAt: now.toISOString(),
			requirements: requirementResults,
			coverage: {
				state: configurationUnknown
					? coveredTerritoryIds.length
						? "partial"
						: "unknown"
					: "covered",
				coveredTerritoryIds,
				pendingTerritoryIds,
			},
		},
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
		compositionTrace,
		applicableRequirements: selected.flatMap((version) =>
			version.requirements
				.filter(
					(requirement) =>
						requirement.required &&
						requirementApplies(requirement.condition, versionContext(version))
				)
				.map((requirement) => ({ ...requirement, policyVersionId: version.id }))
		),
		capabilityStates,
	}
}
