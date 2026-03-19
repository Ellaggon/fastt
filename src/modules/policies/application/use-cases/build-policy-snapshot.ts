import { POLICY_CATEGORY_ORDER } from "@/data/policy/policy-categories"
import type { EffectivePolicyRepositoryPort } from "../ports/EffectivePolicyRepositoryPort"
import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"
import { resolvePolicyByHierarchy } from "./resolve-policy-by-hierarchy"

export async function buildPolicySnapshot(
	deps: {
		effectivePolicyRepo: EffectivePolicyRepositoryPort
		queryRepo: PolicyQueryRepositoryPort
	},
	params: { entityType: string; entityId: string }
) {
	const categories = Object.keys(POLICY_CATEGORY_ORDER)

	for (const category of categories) {
		if (category === "Cancellation" && params.entityType !== "ratePlan") continue
		const resolved = await resolvePolicyByHierarchy(deps, {
			category,
			entityType: params.entityType,
			entityId: params.entityId,
		})

		if (!resolved) continue

		await deps.effectivePolicyRepo.upsertEffectivePolicySnapshot({
			entityType: params.entityType,
			entityId: params.entityId,
			category,
			effectivePolicyId: resolved.policyId,
			effectiveGroupId: resolved.groupId,
			description: resolved.description,
			rules: resolved.rules || [],
			cancellationTiers: resolved.cancellation || [],
			priority: resolved.priority,
		})
	}
}
