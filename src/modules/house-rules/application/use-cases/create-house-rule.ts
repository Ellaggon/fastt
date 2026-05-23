import { randomUUID } from "crypto"

import {
	buildHouseRuleGuestSummary,
	normalizeHouseRulePayload,
	validateHouseRulePayload,
	type HouseRulePayload,
	type HouseRuleType,
} from "../../domain/houseRule"
import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"

const ALLOWED_TYPES: HouseRuleType[] = [
	"Children",
	"Pets",
	"Smoking",
	"Parties",
	"QuietHours",
	"Parking",
	"CheckIn",
	"Checkout",
	"Safety",
	"ExtraBeds",
	"Access",
	"Other",
]

export async function createHouseRule(
	deps: { repo: HouseRuleRepositoryPort },
	input: {
		productId: string
		type: HouseRuleType
		description?: string
		payload?: Partial<HouseRulePayload> | Record<string, unknown> | null
	}
): Promise<{ id: string }> {
	const productId = String(input.productId ?? "").trim()
	const type = String(input.type ?? "").trim() as HouseRuleType
	const payload = normalizeHouseRulePayload(type, input.payload)
	validateHouseRulePayload(type, payload)
	const description = String(
		input.description || buildHouseRuleGuestSummary(type, payload, "") || ""
	).trim()

	if (!productId) throw new Error("validation_error:productId_required")
	if (!ALLOWED_TYPES.includes(type)) throw new Error("validation_error:type_invalid")
	if (!description) throw new Error("validation_error:description_required")

	const id = randomUUID()
	await deps.repo.create({
		id,
		productId,
		type,
		description,
		payloadJson: payload,
		createdAt: new Date(),
	})
	return { id }
}
