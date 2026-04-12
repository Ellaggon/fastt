import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"

export async function releaseExpiredHolds(
	deps: { repo: InventoryHoldRepositoryPort },
	params: { now: Date }
): Promise<{ releasedHolds: number; releasedVariantIds: string[] }> {
	const expiredHolds = await deps.repo.listExpiredHolds({ now: params.now })

	let released = 0
	const variants = new Set<string>()
	for (const item of expiredHolds) {
		const r = await deps.repo.releaseHold({ holdId: item.holdId })
		if (r.released) released++
		if (r.released) variants.add(item.variantId)
	}

	return { releasedHolds: released, releasedVariantIds: [...variants] }
}
