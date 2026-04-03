import type { TaxFeeResolutionRepositoryPort } from "../ports/TaxFeeResolutionRepositoryPort"
import type {
	ResolvedTaxFeeDefinition,
	TaxFeeDefinition,
	TaxFeeScope,
} from "../../domain/tax-fee.types"

const VALID_APPLIES_PER = ["stay", "night", "guest", "guest_night"] as const
const VALID_CALC_TYPES = ["percentage", "fixed"] as const
const VALID_KINDS = ["tax", "fee"] as const
const VALID_INCLUSION = ["included", "excluded"] as const

function isValidDefinition(def: TaxFeeDefinition, now: Date): boolean {
	if (def.status !== "active") return false
	if (def.effectiveFrom && def.effectiveFrom > now) return false
	if (def.effectiveTo && def.effectiveTo < now) return false
	if (!VALID_KINDS.includes(def.kind)) return false
	if (!VALID_CALC_TYPES.includes(def.calculationType)) return false
	if (!VALID_INCLUSION.includes(def.inclusionType)) return false
	if (!VALID_APPLIES_PER.includes(def.appliesPer)) return false
	if (def.value <= 0) return false
	if (def.calculationType === "percentage" && def.currency) return false
	if (def.calculationType === "fixed" && !def.currency) return false
	return true
}

export async function resolveEffectiveTaxFees(
	deps: { repo: TaxFeeResolutionRepositoryPort },
	params: {
		providerId?: string
		productId?: string
		variantId?: string
		ratePlanId?: string
		channel?: string | null
	}
): Promise<{ definitions: ResolvedTaxFeeDefinition[] }> {
	let providerId = params.providerId ?? null

	if (!providerId && params.productId) {
		providerId = await deps.repo.getProviderIdByProductId(params.productId)
	}

	const scopeChain: Array<{ scope: TaxFeeScope; scopeId: string | null }> = [
		{ scope: "global", scopeId: null },
	]
	if (providerId) scopeChain.push({ scope: "provider", scopeId: providerId })
	if (params.productId) scopeChain.push({ scope: "product", scopeId: params.productId })
	if (params.variantId) scopeChain.push({ scope: "variant", scopeId: params.variantId })
	if (params.ratePlanId) scopeChain.push({ scope: "rate_plan", scopeId: params.ratePlanId })

	const channels = params.channel ? [params.channel, null] : [null]

	const assignments = await deps.repo.listActiveAssignments({ scopeChain, channels })
	if (!assignments.length) return { definitions: [] }

	const now = new Date()
	const definitionIds = Array.from(new Set(assignments.map((a) => a.taxFeeDefinitionId)))
	const definitions = await deps.repo.listDefinitionsByIds(definitionIds)
	const definitionById = new Map(definitions.map((d) => [d.id, d]))

	const resolved: ResolvedTaxFeeDefinition[] = []
	for (const a of assignments) {
		const def = definitionById.get(a.taxFeeDefinitionId)
		if (!def) continue
		if (!isValidDefinition(def, now)) continue
		resolved.push({
			definition: def,
			source: { scope: a.scope, scopeId: a.scopeId, definitionId: def.id },
		})
	}

	resolved.sort((a, b) => {
		if (a.definition.priority !== b.definition.priority) {
			return a.definition.priority - b.definition.priority
		}
		const aTime = a.definition.createdAt?.getTime?.() ?? 0
		const bTime = b.definition.createdAt?.getTime?.() ?? 0
		if (aTime !== bTime) return aTime - bTime
		return a.definition.id.localeCompare(b.definition.id)
	})

	console.info("tax.resolve", {
		scopes: scopeChain.map((s) => `${s.scope}:${s.scopeId ?? "global"}`),
		channel: params.channel ?? null,
		assignments: assignments.length,
		definitions: resolved.length,
	})

	return { definitions: resolved }
}
