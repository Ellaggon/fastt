import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"

export async function releaseExpiredHolds(
	deps: { repo: InventoryHoldRepositoryPort },
	params: { now: Date }
): Promise<{ releasedHolds: number }> {
	const holdIds = await deps.repo.listExpiredHoldIds({ now: params.now })

	let released = 0
	for (const holdId of holdIds) {
		const r = await deps.repo.releaseHold({ holdId })
		if (r.released) released++
	}

	return { releasedHolds: released }
}
