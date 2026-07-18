import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"
import {
	normalizeHouseRulePayload,
	type HouseRulePayload,
	type HouseRuleType,
} from "../../domain/houseRule"

type HouseRuleRow = {
	id: string
	productId: string
	type: HouseRuleType
	payloadJson: HouseRulePayload
	createdAt: Date
}

type HouseRuleDto = {
	id: string
	productId: string
	type: string
	payloadJson: HouseRulePayload
	createdAt: string
}

function sortRows(rows: HouseRuleRow[]) {
	rows.sort((a, b) => {
		const at = a.createdAt?.getTime?.() ?? 0
		const bt = b.createdAt?.getTime?.() ?? 0
		if (at !== bt) return at - bt
		return String(a.id).localeCompare(String(b.id))
	})
}

function serializeRuleRow(row: HouseRuleRow): HouseRuleDto {
	const type = String(row.type ?? "Other") as HouseRuleType
	const payload = normalizeHouseRulePayload(type, row.payloadJson)
	return {
		id: String(row.id),
		productId: String(row.productId),
		type,
		payloadJson: payload,
		createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
	}
}

export async function listHouseRulesByProduct(
	deps: { repo: HouseRuleRepositoryPort },
	productId: string
): Promise<HouseRuleDto[]> {
	const pid = String(productId ?? "").trim()
	if (!pid) return []

	const rows = await deps.repo.listByProduct(pid)
	sortRows(rows)

	return rows.map(serializeRuleRow)
}

export async function listHouseRulesByProductIds(
	deps: { repo: HouseRuleRepositoryPort },
	productIds: string[]
): Promise<Map<string, HouseRuleDto[]>> {
	const ids = Array.from(
		new Set(productIds.map((productId) => String(productId ?? "").trim()).filter(Boolean))
	)
	if (!ids.length) return new Map()

	const rows = await deps.repo.listByProductIds(ids)
	sortRows(rows)

	const rulesByProduct = new Map<string, HouseRuleDto[]>()
	for (const row of rows.map(serializeRuleRow)) {
		const bucket = rulesByProduct.get(row.productId) ?? []
		bucket.push(row)
		rulesByProduct.set(row.productId, bucket)
	}
	for (const id of ids) {
		if (!rulesByProduct.has(id)) rulesByProduct.set(id, [])
	}
	return rulesByProduct
}
