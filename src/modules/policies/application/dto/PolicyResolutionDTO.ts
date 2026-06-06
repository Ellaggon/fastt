import type { PolicyScope } from "@/modules/policies/domain/policy.scope"
import type {
	CancellationTierRow,
	PolicyRuleRow,
	PolicySnapshot,
} from "@/modules/policies/application/ports/PolicyResolutionRepositoryPort"

export type PolicyResolutionDTOPolicy = {
	category: string
	policy: PolicySnapshot & {
		rules: PolicyRuleRow[]
		cancellationTiers: CancellationTierRow[]
	}
	resolvedFromScope: Exclude<PolicyScope, "global"> | "global"
}

export type PolicyResolutionCoverage = {
	hasFullCoverage: boolean
	missingDates?: string[]
}

export type PolicyResolutionDTO = {
	version: "v2"
	policies: PolicyResolutionDTOPolicy[]
	missingCategories: string[]
	coverage: PolicyResolutionCoverage
	asOfDate: string
	warnings: string[]
}

export function isPolicyResolutionDTO(value: unknown): value is PolicyResolutionDTO {
	const candidate = value as PolicyResolutionDTO | null
	if (!candidate || typeof candidate !== "object") return false
	if (candidate.version !== "v2") return false
	if (!Array.isArray(candidate.policies)) return false
	if (!Array.isArray(candidate.missingCategories)) return false
	if (!candidate.coverage || typeof candidate.coverage !== "object") return false
	if (typeof candidate.coverage.hasFullCoverage !== "boolean") return false
	if (typeof candidate.asOfDate !== "string") return false
	if (!Array.isArray(candidate.warnings)) return false
	return true
}
