import { randomUUID } from "node:crypto"
import { z } from "zod"

import type { BaseRateRepositoryPort } from "../ports/BaseRateRepositoryPort"
import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"
import type { PriceRuleCommandRepositoryPort } from "../ports/PriceRuleCommandRepositoryPort"
import { ensureDefaultRatePlan } from "./ensure-default-rateplan"

const createRuleSchema = z.object({
	variantId: z.string().trim().min(1),
	type: z.enum(["percentage", "fixed"]),
	value: z.number(),
})

/**
 * CAPA 4D minimal: create a rule on the variant's DEFAULT rate plan.
 *
 * Validations are aligned with the hardened engine:
 * - percentage: [-100, 1000]
 * - fixed: >= -basePrice (basePrice comes from PricingBaseRate; missing base rate => basePrice=0)
 */
export async function createDefaultPriceRule(
	deps: {
		baseRateRepo: BaseRateRepositoryPort
		ratePlanRepo: RatePlanRepositoryPort
		ratePlanCmdRepo: RatePlanCommandRepositoryPort
		priceRuleCmdRepo: PriceRuleCommandRepositoryPort
	},
	params: { variantId: string; type: "percentage" | "fixed"; value: number }
): Promise<{ ruleId: string; ratePlanId: string }> {
	const parsed = createRuleSchema.parse(params)

	const baseRate = await deps.baseRateRepo.getByVariantId(parsed.variantId)
	const basePrice = Number(baseRate?.basePrice ?? 0)

	if (parsed.type === "percentage" && (parsed.value < -100 || parsed.value > 1000)) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["value"],
				message: "Percentage rule out of bounds (-100 to 1000)",
			},
		])
	}

	if (parsed.type === "fixed" && parsed.value < -basePrice) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["value"],
				message: "Fixed rule too low for base price",
			},
		])
	}

	const { ratePlanId } = await ensureDefaultRatePlan(
		{ ratePlanRepo: deps.ratePlanRepo, ratePlanCmdRepo: deps.ratePlanCmdRepo },
		{ variantId: parsed.variantId }
	)

	const createdAt = new Date()
	const ruleId = randomUUID()

	await deps.priceRuleCmdRepo.create({
		id: ruleId,
		ratePlanId,
		name: null,
		type: parsed.type,
		value: parsed.value,
		priority: 10,
		isActive: true,
		createdAt,
	})

	return { ruleId, ratePlanId }
}
