import type { TaxFeeCommandRepositoryPort } from "../ports/TaxFeeCommandRepositoryPort"
import type {
	TaxFeeAppliesPer,
	TaxFeeCalculationType,
	TaxFeeDefinition,
	TaxFeeInclusionType,
	TaxFeeKind,
} from "../../domain/tax-fee.types"

const APPLIES_PER: TaxFeeAppliesPer[] = ["stay", "night", "guest", "guest_night"]
const CALC_TYPES: TaxFeeCalculationType[] = ["percentage", "fixed"]
const INCLUSION: TaxFeeInclusionType[] = ["included", "excluded"]
const KINDS: TaxFeeKind[] = ["tax", "fee"]

export async function updateTaxFeeDefinition(
	deps: { repo: TaxFeeCommandRepositoryPort },
	params: {
		id: string
		providerId?: string | null
		code: string
		name: string
		kind: TaxFeeKind
		calculationType: TaxFeeCalculationType
		value: number
		currency?: string | null
		inclusionType: TaxFeeInclusionType
		appliesPer: TaxFeeAppliesPer
		priority?: number
		jurisdictionJson?: unknown | null
		effectiveFrom?: Date | null
		effectiveTo?: Date | null
		status?: "active" | "archived"
	}
): Promise<{ id: string }> {
	const existing = await deps.repo.getDefinitionById(params.id)
	if (!existing) throw new Error("Tax/fee definition not found")

	if ((existing.providerId ?? null) !== (params.providerId ?? null)) {
		throw new Error("Not found")
	}

	const code = String(params.code || "").trim()
	if (!code) throw new Error("Invalid code: required")
	if (code !== code.toUpperCase()) throw new Error("Invalid code: must be uppercase")
	if (!/^[A-Z0-9_]+$/.test(code)) {
		throw new Error("Invalid code: only A-Z, 0-9, and underscore allowed")
	}

	if (!KINDS.includes(params.kind)) throw new Error("Invalid kind")
	if (!CALC_TYPES.includes(params.calculationType)) throw new Error("Invalid calculation_type")
	if (!INCLUSION.includes(params.inclusionType)) throw new Error("Invalid inclusion_type")
	if (!APPLIES_PER.includes(params.appliesPer)) throw new Error("Invalid applies_per")

	if (params.value <= 0) throw new Error("Invalid value: must be > 0")

	if (params.calculationType === "fixed" && !params.currency) {
		throw new Error("Currency required for fixed tax/fee")
	}
	if (params.calculationType === "percentage" && params.currency) {
		throw new Error("Currency not allowed for percentage tax/fee")
	}

	if (params.effectiveFrom && params.effectiveTo && params.effectiveFrom >= params.effectiveTo) {
		throw new Error("Invalid effective dates: effective_from must be < effective_to")
	}

	const duplicate = await deps.repo.findActiveDefinitionByCodeProvider({
		code,
		providerId: params.providerId ?? null,
	})
	if (duplicate && duplicate.id !== params.id) {
		throw new Error("Duplicate active definition for code")
	}

	const next: Omit<TaxFeeDefinition, "createdAt" | "updatedAt"> = {
		id: params.id,
		providerId: params.providerId ?? null,
		code,
		name: params.name,
		kind: params.kind,
		calculationType: params.calculationType,
		value: params.value,
		currency: params.currency ?? null,
		inclusionType: params.inclusionType,
		appliesPer: params.appliesPer,
		priority: params.priority ?? 0,
		jurisdictionJson: params.jurisdictionJson ?? null,
		effectiveFrom: params.effectiveFrom ?? null,
		effectiveTo: params.effectiveTo ?? null,
		status: params.status ?? "active",
	}

	await deps.repo.updateDefinition(next)

	return { id: params.id }
}
