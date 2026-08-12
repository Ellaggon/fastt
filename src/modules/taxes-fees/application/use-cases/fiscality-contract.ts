import type { TaxFeeAssignment, TaxFeeDefinition, TaxFeeScope } from "../../domain/tax-fee.types"

export const FISCALITY_CONTRACT_VERSION = "fiscality_contract_v1" as const

/**
 * A more specific scope is resolved first when explaining a result. Existing
 * assignments remain additive during the Phase 0 migration.
 */
export const FISCAL_SCOPE_PRECEDENCE = [
	"rate_plan",
	"variant",
	"product",
	"provider",
] as const satisfies readonly Exclude<TaxFeeScope, "global">[]

export const FISCAL_ASSIGNMENT_STRATEGY = "accumulate" as const

export type FiscalDefinitionLifecycleStatus =
	| "draft"
	| "scheduled"
	| "active"
	| "paused"
	| "expired"
	| "conflict"
	| "archived"

export type FiscalityAuditAssignment = Pick<
	TaxFeeAssignment,
	"id" | "taxFeeDefinitionId" | "scope" | "scopeId" | "channel" | "status"
>

export function readFiscalJurisdictionCountry(value: unknown): string | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	const country = String((value as { country?: unknown }).country ?? "")
		.trim()
		.toUpperCase()
	return /^[A-Z]{2}$/.test(country) ? country : null
}

export function fiscalDefinitionLifecycleStatus(input: {
	definition: Pick<TaxFeeDefinition, "status" | "effectiveFrom" | "effectiveTo">
	assignments: FiscalityAuditAssignment[]
	hasConflict?: boolean
	now?: Date
}): FiscalDefinitionLifecycleStatus {
	const now = input.now ?? new Date()
	if (input.definition.status === "archived") return "archived"
	if (input.definition.effectiveFrom && input.definition.effectiveFrom > now) return "scheduled"
	if (input.definition.effectiveTo && input.definition.effectiveTo < now) return "expired"
	if (input.hasConflict) return "conflict"
	if (input.assignments.some((assignment) => assignment.status === "active")) return "active"
	if (input.assignments.length > 0) return "paused"
	return "draft"
}

export function fiscalScopeRank(scope: TaxFeeScope): number {
	const index = FISCAL_SCOPE_PRECEDENCE.indexOf(scope as (typeof FISCAL_SCOPE_PRECEDENCE)[number])
	return index === -1 ? FISCAL_SCOPE_PRECEDENCE.length : index
}
