import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"
import { applyInventoryMutation } from "./apply-inventory-mutation"

export async function releaseExpiredHolds(
	deps: { repo: InventoryHoldRepositoryPort },
	params: { now: Date }
): Promise<{ releasedHolds: number; releasedVariantIds: string[] }> {
	const expiredHolds = await deps.repo.listExpiredHolds({ now: params.now })

	let released = 0
	const variants = new Set<string>()
	for (const item of expiredHolds) {
		const r = await applyInventoryMutation({
			mutate: async () => deps.repo.releaseHold({ holdId: item.holdId }),
			recompute: {
				variantId: item.variantId,
				from: item.from,
				to: item.to,
				reason: "hold_expire",
				idempotencyKey: `hold_expire:${item.holdId}`,
			},
			logContext: {
				action: "hold_expire",
				holdId: item.holdId,
				variantId: item.variantId,
			},
		})
		if (r.released) released++
		if (r.released) variants.add(item.variantId)
	}

	return { releasedHolds: released, releasedVariantIds: [...variants] }
}
