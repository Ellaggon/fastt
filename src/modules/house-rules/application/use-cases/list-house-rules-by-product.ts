import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"
import {
	normalizeHouseRulePayload,
	type HouseRulePayload,
	type HouseRuleType,
} from "../../domain/houseRule"

export async function listHouseRulesByProduct(
	deps: { repo: HouseRuleRepositoryPort },
	productId: string
): Promise<
	Array<{
		id: string
		productId: string
		type: string
		payloadJson: HouseRulePayload
		createdAt: string
	}>
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

	return rows.map((r) => {
		const type = String(r.type ?? "Other") as HouseRuleType
		const payload = normalizeHouseRulePayload(type, r.payloadJson)
		return {
			id: String(r.id),
			productId: String(r.productId),
			type,
			payloadJson: payload,
			createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
		}
	})
}
