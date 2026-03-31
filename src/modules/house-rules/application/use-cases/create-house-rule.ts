import { randomUUID } from "crypto"

import type { HouseRuleType } from "../../domain/houseRule"
import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"

const ALLOWED_TYPES: HouseRuleType[] = [
	"Children",
	"Pets",
	"Smoking",
	"ExtraBeds",
	"Access",
	"Other",
]

export async function createHouseRule(
	deps: { repo: HouseRuleRepositoryPort },
	input: { productId: string; type: HouseRuleType; description: string }
): Promise<{ id: string }> {
	const productId = String(input.productId ?? "").trim()
	const type = String(input.type ?? "").trim() as HouseRuleType
	const description = String(input.description ?? "").trim()

	if (!productId) throw new Error("validation_error:productId_required")
	if (!ALLOWED_TYPES.includes(type)) throw new Error("validation_error:type_invalid")
	if (!description) throw new Error("validation_error:description_required")

	const id = randomUUID()
	await deps.repo.create({ id, productId, type, description, createdAt: new Date() })
	return { id }
}
