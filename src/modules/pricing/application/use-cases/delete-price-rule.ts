import { z } from "zod"

import type { PriceRuleCommandRepositoryPort } from "../ports/PriceRuleCommandRepositoryPort"

const deleteRuleSchema = z.object({
	ruleId: z.string().trim().min(1),
})

export async function deletePriceRule(
	deps: { priceRuleCmdRepo: PriceRuleCommandRepositoryPort },
	params: { ruleId: string }
): Promise<{ deleted: boolean }> {
	const parsed = deleteRuleSchema.parse(params)
	const res = await deps.priceRuleCmdRepo.deleteById(parsed.ruleId)
	return { deleted: res === "ok" }
}
