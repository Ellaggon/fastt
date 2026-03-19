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

export interface EffectivePolicyRepositoryPort {
	upsertEffectivePolicySnapshot(row: EffectivePolicySnapshotRow): Promise<void>
}
