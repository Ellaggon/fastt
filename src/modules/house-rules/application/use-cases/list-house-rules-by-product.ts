import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"

export async function listHouseRulesByProduct(
	deps: { repo: HouseRuleRepositoryPort },
	productId: string
): Promise<
	Array<{ id: string; productId: string; type: string; description: string; createdAt: string }>
> {
	const pid = String(productId ?? "").trim()
	if (!pid) return []

	const rows = await deps.repo.listByProduct(pid)
	rows.sort((a, b) => {
		const at = a.createdAt?.getTime?.() ?? 0
		const bt = b.createdAt?.getTime?.() ?? 0
		if (at !== bt) return at - bt
		return String(a.id).localeCompare(String(b.id))
	})

	return rows.map((r) => ({
		id: String(r.id),
		productId: String(r.productId),
		type: String(r.type),
		description: String(r.description ?? ""),
		createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
	}))
}
