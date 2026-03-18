import { db, EffectivePolicy } from "astro:db"
import { POLICY_CATEGORY_ORDER } from "@/data/policy/policy-categories"
import { resolvePolicyByHierarchy } from "../hierarchy/policy.resolve-hierarchy"

export async function buildPolicySnapshot(entityType: string, entityId: string) {
	const categories = Object.keys(POLICY_CATEGORY_ORDER)

	for (const category of categories) {
		if (category === "Cancellation" && entityType !== "ratePlan") continue
		const resolved = await resolvePolicyByHierarchy(category, entityType, entityId)

		if (!resolved) continue

		await db
			.insert(EffectivePolicy)
			.values({
				id: crypto.randomUUID(),
				entityType,
				entityId,
				category,
				effectivePolicyId: resolved.policyId,
				effectiveGroupId: resolved.groupId,
				description: resolved.description,
				rules: JSON.stringify(resolved.rules || []),
				cancellationTiers: JSON.stringify(resolved.cancellation || []),
				priority: resolved.priority,
			})
			.onConflictDoUpdate({
				target: [EffectivePolicy.entityType, EffectivePolicy.entityId, EffectivePolicy.category],
				set: {
					effectivePolicyId: resolved.policyId,
					effectiveGroupId: resolved.groupId,
					description: resolved.description,
					rules: resolved.rules,
					cancellationTiers: resolved.cancellation,
					priority: resolved.priority,
				},
			})
	}
}
