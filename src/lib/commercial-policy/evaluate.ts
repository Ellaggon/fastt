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
}
export type CommercialPolicyRequirement = {
	key: string
	capabilities: CommercialCapability[]
	acceptedEvidence: string[]
	required: boolean
	blockingAction: string
	reviewOwner: string
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
	requirements: CommercialPolicyRequirement[]
}
export type CommercialPolicyBlocker = {
	id: string
	capabilities: CommercialCapability[]
	action: string
	policyVersionId: string | null
}
export type CommercialPolicyDiagnosis = {
	policyStatus: "supported" | "unsupported"
	capabilities: Record<CommercialCapability, boolean>
	blockers: CommercialPolicyBlocker[]
	policyVersionIds: string[]
}

const allCapabilities: CommercialCapability[] = [
	"publish",
	"booking",
	"collect_payment",
	"payout",
	"integrations",
]

/** Fail closed on absent, conflicting or unapproved legal/operational annexes. */
export function evaluateCommercialPolicy(input: {
	context: CommercialPolicyContext
	versions: CommercialPolicyVersion[]
	verifiedEvidence: string[]
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
		input.context.collectionModel === "undecided"
			? ["holder", "product"]
			: ["holder", "product", "tax", "payout"]
	const blockers: CommercialPolicyBlocker[] = []
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
	const verified = new Set(input.verifiedEvidence)
	for (const version of selected) {
		for (const requirement of version.requirements) {
			if (!requirement.required) continue
			if (!requirement.acceptedEvidence.some((evidence) => verified.has(evidence))) {
				blockers.push({
					id: `requirement_${requirement.key}`,
					capabilities: requirement.capabilities,
					action: requirement.blockingAction,
					policyVersionId: version.id,
				})
			}
		}
	}
	return {
		policyStatus: blockers.some(
			(row) => row.id.startsWith("policy_context_") || row.id.startsWith("policy_contract_")
		)
			? "unsupported"
			: "supported",
		capabilities: Object.fromEntries(
			allCapabilities.map((capability) => [
				capability,
				!blockers.some((blocker) => blocker.capabilities.includes(capability)),
			])
		) as Record<CommercialCapability, boolean>,
		blockers,
		policyVersionIds: selected.map((row) => row.id),
	}
}
