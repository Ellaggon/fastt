import { randomUUID } from "crypto"

import {
	buildHouseRuleGuestSummary,
	HOUSE_RULE_TYPES,
	isHouseRuleScope,
	isVariantOverrideHouseRuleType,
	normalizeHouseRulePayload,
	validateHouseRulePayload,
	type HouseRulePayload,
	type HouseRuleScope,
	type HouseRuleType,
} from "../../domain/houseRule"
import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"

export async function createHouseRule(
	deps: { repo: HouseRuleRepositoryPort },
	input: {
		productId: string
		type: HouseRuleType
		payload?: Partial<HouseRulePayload> | Record<string, unknown> | null
		scope?: HouseRuleScope | string | null
		scopeId?: string | null
	}
): Promise<{ id: string }> {
	const productId = String(input.productId ?? "").trim()
	const type = String(input.type ?? "").trim() as HouseRuleType
	const requestedScope = String(input.scope ?? "product").trim()
	const scope: HouseRuleScope = isHouseRuleScope(requestedScope) ? requestedScope : "product"
	const scopeId = scope === "variant" ? String(input.scopeId ?? "").trim() : ""
	const payload = normalizeHouseRulePayload(type, input.payload)
	validateHouseRulePayload(type, payload)
	const summary = buildHouseRuleGuestSummary(type, payload).trim()

	if (!productId) throw new Error("validation_error:productId_required")
	if (!HOUSE_RULE_TYPES.includes(type)) throw new Error("validation_error:type_invalid")
	if (scope === "variant") {
		if (!scopeId) throw new Error("validation_error:variantId_required")
		if (!isVariantOverrideHouseRuleType(type))
			throw new Error("validation_error:type_not_overridable")
		const belongs = await deps.repo.hotelRoomBelongsToProduct(productId, scopeId)
		if (!belongs) throw new Error("validation_error:variant_invalid")
	}
	if (!summary) throw new Error("validation_error:payload_summary_required")

	const existing = await deps.repo.findByIdentity({
		productId,
		scope,
		scopeId: scope === "variant" ? scopeId : null,
		type,
	})
	if (existing) {
		await deps.repo.updatePayload(existing.id, payload)
		return { id: existing.id }
	}

	const id = randomUUID()
	await deps.repo.create({
		id,
		productId,
		scope,
		scopeId: scope === "variant" ? scopeId : null,
		type,
		payloadJson: payload,
		createdAt: new Date(),
	})
	return { id }
}
