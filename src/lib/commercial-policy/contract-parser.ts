import type { ExperienceFormat } from "@/shared/domain/experience-format"
import type { CommercialPolicyRequirement, CommercialPolicyContextSelector } from "./evaluate"
import { documentAcceptanceSchema } from "@/shared/domain/document-acceptance"
import { compositionSchema } from "./composition"

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: []
}

export function normalizeRequirementCondition(
	value: unknown
): CommercialPolicyRequirement["condition"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	const raw = value as Record<string, unknown>
	const list = (key: string) => stringArray(raw[key]).slice(0, 50)
	const condition = {
		evidenceSubjectSelector: ["holder", "guides", "operator", "resources"].includes(
			String(raw.evidenceSubjectSelector)
		)
			? (raw.evidenceSubjectSelector as NonNullable<
					CommercialPolicyRequirement["condition"]
				>["evidenceSubjectSelector"])
			: undefined,
		legalFormCodes: list("legalFormCodes"),
		executionModes: list("executionModes"),
		foodHandlingModes: list("foodHandlingModes"),
		transportProviders: list("transportProviders"),
		operatingRoles: list("operatingRoles"),
		activityClasses: list("activityClasses"),
		jurisdictionCodes: stringArray(raw.jurisdictionCodes),
		resourceIds: list("resourceIds"),
		subjectReferences: list("subjectReferences"),
		evidenceScope: ["provider", "product", "operation"].includes(String(raw.evidenceScope))
			? (String(raw.evidenceScope) as "provider" | "product" | "operation")
			: undefined,
	}
	return Object.values(condition).some((value) =>
		Array.isArray(value) ? value.length > 0 : Boolean(value)
	)
		? condition
		: null
}

export function normalizeContextSelector(value: unknown): CommercialPolicyContextSelector | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	const raw = value as Record<string, unknown>
	const selector = {
		...(raw.contextVersion === 3 ? { composition: compositionSchema.parse(raw.composition) } : {}),
		legalFormCodes: stringArray(raw.legalFormCodes),
		executionModes: stringArray(raw.executionModes),
		foodHandlingModes: stringArray(raw.foodHandlingModes),
		transportProviders: stringArray(raw.transportProviders),
		contextVersion: raw.contextVersion === undefined ? undefined : Number(raw.contextVersion),
		experienceFormats: stringArray(raw.experienceFormats) as ExperienceFormat[],
		operatingRoles: stringArray(raw.operatingRoles).slice(0, 12),
		activityClasses: stringArray(raw.activityClasses).slice(0, 12),
		jurisdictionCodes: stringArray(raw.jurisdictionCodes),
	}
	return selector.operatingRoles.length &&
		selector.activityClasses.length &&
		selector.jurisdictionCodes.length
		? selector
		: null
}

export function parseAcceptedEvidence(value: unknown) {
	if (value === null || value === undefined || Array.isArray(value))
		return { acceptedEvidence: stringArray(value), documentAcceptance: null }
	return { acceptedEvidence: [], documentAcceptance: documentAcceptanceSchema.parse(value) }
}

export function parsePolicyRequirement(rule: {
	requirementKey: string
	required: boolean
	capabilitiesJson: unknown
	acceptedEvidenceJson: unknown
	blockingAction: string | null
	reviewOwner: string | null
	sourceKind: string | null
	sourceReference: string | null
	sourceCheckedAt: Date | null
	conditionJson: unknown
}): CommercialPolicyRequirement {
	const capabilities = stringArray(rule.capabilitiesJson)
	if (
		capabilities.some(
			(capability) =>
				!["publish", "booking", "collect_payment", "payout", "integrations"].includes(capability)
		)
	)
		throw new Error("invalid_policy_capability")
	return {
		key: rule.requirementKey,
		required: rule.required,
		capabilities: capabilities as CommercialPolicyRequirement["capabilities"],
		...parseAcceptedEvidence(rule.acceptedEvidenceJson),
		blockingAction: rule.blockingAction ?? "",
		reviewOwner: rule.reviewOwner ?? "",
		sourceKind: ["legal", "contract", "fastt_policy"].includes(rule.sourceKind ?? "")
			? (rule.sourceKind as CommercialPolicyRequirement["sourceKind"])
			: null,
		sourceReference: rule.sourceReference,
		sourceCheckedAt: rule.sourceCheckedAt,
		condition: normalizeRequirementCondition(rule.conditionJson),
	}
}
