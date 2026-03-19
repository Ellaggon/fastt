import type {
	PolicyQueryRepositoryPort,
	ResolvePoliciesParams,
	ResolvedPolicyRow,
} from "../ports/PolicyQueryRepositoryPort"
import type { PolicyCachePort } from "../ports/PolicyCachePort"

type ResolvedPolicyResult = {
	id: string
	groupId: string
	category: string
	description: string
	version: number
	sourceScope: string
	rules?: any[]
	cancellationTiers?: any[]
}

export async function resolvePolicies(
	deps: {
		queryRepo: PolicyQueryRepositoryPort
		cache: PolicyCachePort<ResolvedPolicyResult[]>
	},
	params: ResolvePoliciesParams
) {
	const cached = deps.cache.get(params)
	if (cached) return cached

	const { hotelId, productId, variantId, includeCancellation = false, includeRules } = params

	const scopeOrder = [
		{ scope: "variant", id: variantId },
		{ scope: "product", id: productId },
		{ scope: "hotel", id: hotelId },
	].filter((s) => s.id)

	const scopeIds = scopeOrder.map((s) => s.id!)
	if (!scopeIds.length) return []

	const rows = await deps.queryRepo.resolvePolicyRows(params)

	/* priority resolver determinístico */
	const sorted = (rows as ResolvedPolicyRow[]).sort(
		(a, b) => scopeIds.indexOf(a.scopeId) - scopeIds.indexOf(b.scopeId)
	)

	const resolved = new Map<string, ResolvedPolicyResult>()

	for (const row of sorted) {
		if (!resolved.has(row.groupId)) {
			resolved.set(row.groupId, {
				id: row.id,
				groupId: row.groupId,
				category: row.category,
				description: row.description,
				version: row.version,
				sourceScope: row.scope,
			})
		}
	}

	const result = [...resolved.values()]

	if (includeRules && result.length) {
		const policyIds = result.map((p) => p.id)

		const [rules, tiers] = await Promise.all([
			deps.queryRepo.listPolicyRulesByPolicyIds(policyIds),
			deps.queryRepo.listCancellationTiersByPolicyIds(policyIds),
		])

		for (const policy of result) {
			policy.rules = rules.filter((r) => r.policyId === policy.id)
			policy.cancellationTiers = tiers.filter((t) => t.policyId === policy.id)
		}
	}

	deps.cache.set(params, result)
	return result
}
