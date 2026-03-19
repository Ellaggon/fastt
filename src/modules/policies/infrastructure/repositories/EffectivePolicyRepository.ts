import { db, EffectivePolicy } from "astro:db"
import type {
	EffectivePolicyRepositoryPort,
	EffectivePolicySnapshotRow,
} from "../../application/ports/EffectivePolicyRepositoryPort"

export class EffectivePolicyRepository implements EffectivePolicyRepositoryPort {
	async upsertEffectivePolicySnapshot(row: EffectivePolicySnapshotRow) {
		await db
			.insert(EffectivePolicy)
			.values({
				id: crypto.randomUUID(),
				entityType: row.entityType,
				entityId: row.entityId,
				category: row.category,
				effectivePolicyId: row.effectivePolicyId,
				effectiveGroupId: row.effectiveGroupId,
				description: row.description,
				rules: row.rules as any,
				cancellationTiers: row.cancellationTiers as any,
				priority: row.priority,
			})
			.onConflictDoUpdate({
				target: [EffectivePolicy.entityType, EffectivePolicy.entityId, EffectivePolicy.category],
				set: {
					effectivePolicyId: row.effectivePolicyId,
					effectiveGroupId: row.effectiveGroupId,
					description: row.description,
					rules: row.rules as any,
					cancellationTiers: row.cancellationTiers as any,
					priority: row.priority,
				},
			})
	}
}
