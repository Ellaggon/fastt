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
