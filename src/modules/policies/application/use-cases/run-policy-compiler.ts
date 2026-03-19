import type { PolicyCachePort } from "../ports/PolicyCachePort"
import type { EffectivePolicyRepositoryPort } from "../ports/EffectivePolicyRepositoryPort"
import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"
import { buildPolicySnapshot } from "./build-policy-snapshot"

export async function runPolicyCompiler(
	deps: {
		effectivePolicyRepo: EffectivePolicyRepositoryPort
		queryRepo: PolicyQueryRepositoryPort
		cache: PolicyCachePort<unknown>
	},
	params: { entityType: string; entityId: string }
) {
	await buildPolicySnapshot(
		{ effectivePolicyRepo: deps.effectivePolicyRepo, queryRepo: deps.queryRepo },
		params
	)

	// The legacy cache invalidation was inconsistent; for now, clear all to avoid staleness.
	deps.cache.clearAll()
}
