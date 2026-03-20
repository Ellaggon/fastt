export type EffectivePolicySnapshotRow = {
	entityType: string
	entityId: string
	category: string
	effectivePolicyId: string
	effectiveGroupId: string
	description: string
	rules: unknown
	cancellationTiers: unknown
	priority: number
}

export type EffectivePolicyRow = EffectivePolicySnapshotRow & { id: string }

export interface EffectivePolicyRepositoryPort {
	upsertEffectivePolicySnapshot(row: EffectivePolicySnapshotRow): Promise<void>
	listByProduct(productId: string): Promise<EffectivePolicyRow[]>
}
