import { buildPolicySnapshotUseCase, resolvePolicyByHierarchyUseCase } from "@/container"

export async function getEffectivePolicy(entityType: string, entityId: string, category: string) {
	return resolvePolicyByHierarchyUseCase({ category, entityType, entityId })
}

export async function rebuildPolicySnapshots(entityType: string, entityId: string) {
	await buildPolicySnapshotUseCase({ entityType, entityId })
}
