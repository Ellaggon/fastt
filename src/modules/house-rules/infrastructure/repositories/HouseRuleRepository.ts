import {
	and,
	db,
	eq,
	HouseRule as HouseRuleTable,
	inArray,
	isNull,
	ne,
	Variant,
} from "@/shared/infrastructure/db/compat"

import type { HouseRulePayload, HouseRuleScope, HouseRuleType } from "../../domain/houseRule"
import type {
	HouseRuleRecord,
	HouseRuleRepositoryPort,
} from "../../application/ports/HouseRuleRepositoryPort"

function asRecord(row: {
	id: string
	productId: string | null
	scope: string | null
	scopeId: string | null
	type: string | null
	payloadJson: unknown
	createdAt: Date | null
}): HouseRuleRecord {
	return {
		id: String(row.id),
		productId: String(row.productId ?? ""),
		scope: (String(row.scope ?? "product") === "variant" ? "variant" : "product") as HouseRuleScope,
		scopeId: row.scopeId ? String(row.scopeId) : null,
		type: String(row.type ?? "Other") as HouseRuleType,
		payloadJson: row.payloadJson as HouseRulePayload,
		createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(String(row.createdAt)),
	}
}

const ruleColumns = {
	id: HouseRuleTable.id,
	productId: HouseRuleTable.productId,
	scope: HouseRuleTable.scope,
	scopeId: HouseRuleTable.scopeId,
	type: HouseRuleTable.type,
	payloadJson: HouseRuleTable.payloadJson,
	createdAt: HouseRuleTable.createdAt,
}

export class HouseRuleRepository implements HouseRuleRepositoryPort {
	async create(rule: {
		id: string
		productId: string
		scope: HouseRuleScope
		scopeId: string | null
		type: HouseRuleType
		payloadJson: HouseRulePayload
		createdAt: Date
	}) {
		await db.insert(HouseRuleTable).values({
			id: rule.id,
			productId: rule.productId,
			scope: rule.scope,
			scopeId: rule.scopeId,
			type: rule.type,
			payloadJson: rule.payloadJson,
			createdAt: rule.createdAt,
		})
	}

	async updatePayload(id: string, payloadJson: HouseRulePayload) {
		await db.update(HouseRuleTable).set({ payloadJson }).where(eq(HouseRuleTable.id, id))
	}

	async findByIdentity(params: {
		productId: string
		scope: HouseRuleScope
		scopeId: string | null
		type: HouseRuleType
	}) {
		const scopeFilter =
			params.scope === "variant" && params.scopeId
				? eq(HouseRuleTable.scopeId, params.scopeId)
				: isNull(HouseRuleTable.scopeId)
		const row = await db
			.select(ruleColumns)
			.from(HouseRuleTable)
			.where(
				and(
					eq(HouseRuleTable.productId, params.productId),
					eq(HouseRuleTable.scope, params.scope),
					eq(HouseRuleTable.type, params.type),
					scopeFilter
				)
			)
			.then((rows) => rows[0])
		return row ? asRecord(row) : null
	}

	async listByProduct(productId: string) {
		const rows = await db
			.select(ruleColumns)
			.from(HouseRuleTable)
			.where(and(eq(HouseRuleTable.productId, productId), eq(HouseRuleTable.scope, "product")))
		return rows.map(asRecord)
	}

	async listByProductIds(productIds: string[]) {
		const ids = Array.from(
			new Set(productIds.map((productId) => String(productId ?? "").trim()).filter(Boolean))
		)
		if (!ids.length) return []

		const rows = await db
			.select(ruleColumns)
			.from(HouseRuleTable)
			.where(and(inArray(HouseRuleTable.productId, ids), eq(HouseRuleTable.scope, "product")))
		return rows.map(asRecord)
	}

	async listVariantOverrides(productId: string, variantId: string) {
		const rows = await db
			.select(ruleColumns)
			.from(HouseRuleTable)
			.where(
				and(
					eq(HouseRuleTable.productId, productId),
					eq(HouseRuleTable.scope, "variant"),
					eq(HouseRuleTable.scopeId, variantId)
				)
			)
		return rows.map(asRecord)
	}

	async hotelRoomBelongsToProduct(productId: string, variantId: string) {
		const row = await db
			.select({ id: Variant.id })
			.from(Variant)
			.where(
				and(
					eq(Variant.id, variantId),
					eq(Variant.productId, productId),
					eq(Variant.kind, "hotel_room"),
					ne(Variant.lifecycleState, "archived")
				)
			)
			.then((rows) => rows[0])
		return Boolean(row?.id)
	}

	async delete(id: string) {
		await db.delete(HouseRuleTable).where(eq(HouseRuleTable.id, id))
	}
}
