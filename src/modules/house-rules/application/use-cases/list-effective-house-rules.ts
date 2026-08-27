import {
	resolveEffectiveHouseRules,
	type EffectiveHouseRule,
} from "../../domain/effectiveHouseRules"
import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"
import { serializeHouseRule } from "./list-house-rules-by-product"

export async function listEffectiveHouseRules(
	deps: { repo: HouseRuleRepositoryPort },
	productId: string,
	variantId?: string | null
): Promise<EffectiveHouseRule[]> {
	const pid = String(productId ?? "").trim()
	if (!pid) return []
	const vid = String(variantId ?? "").trim()
	const productRules = (await deps.repo.listByProduct(pid)).map(serializeHouseRule)
	if (!vid) return resolveEffectiveHouseRules({ productRules })
	const variantRules = (await deps.repo.listVariantOverrides(pid, vid)).map(serializeHouseRule)
	return resolveEffectiveHouseRules({ productRules, variantRules })
}
