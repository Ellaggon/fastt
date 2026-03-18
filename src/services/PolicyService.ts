
import { buildPolicySnapshot } from "@/core/policy/compiler/policy.build-snapshot"
import { resolvePolicyByHierarchy } from "@/core/policy/hierarchy/policy.resolve-hierarchy"

export async function getEffectivePolicy(entityType: string, entityId: string, category: string) {
	return resolvePolicyByHierarchy(category, entityType, entityId)
}

export async function rebuildPolicySnapshots(entityType: string, entityId: string) {
	await buildPolicySnapshot(entityType, entityId)
}
