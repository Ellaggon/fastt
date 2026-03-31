import { z } from "zod"

import {
	computeBasePriceWithRules,
	type MinimalPriceRule,
} from "../../domain/computeBasePriceWithRules"
import { parseStrictMinimalRules } from "../../domain/strictMinimalRules"
import type { Currency } from "../../domain/pricing.types"
import type { BaseRateRepositoryPort } from "../ports/BaseRateRepositoryPort"
import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"

const computePricePreviewSchema = z.object({
	variantId: z.string().trim().min(1),
})

export async function computePricePreview(
	deps: {
		baseRateRepo: BaseRateRepositoryPort
		ratePlanRepo: RatePlanRepositoryPort
		pricingRepo: PricingRepositoryPort
	},
	params: { variantId: string }
): Promise<{ basePrice: number; finalPrice: number; currency: Currency }> {
	const parsed = computePricePreviewSchema.parse(params)

	const baseRate = await deps.baseRateRepo.getByVariantId(parsed.variantId)

	// Base rate is mandatory for real sellability, but preview should remain callable:
	// missing base rate yields a 0 price and is signaled elsewhere via readiness ("pricing_missing").
	const basePrice = Number(baseRate?.basePrice ?? 0)
	const currency: Currency = baseRate?.currency === "BOB" ? "BOB" : "USD"

	const defaultPlan = await deps.ratePlanRepo.getDefaultByVariant(parsed.variantId)
	if (!defaultPlan) {
		// CAPA 4B hardening: no default plan means "no rules applied".
		return { basePrice, finalPrice: basePrice, currency }
	}

	const dbRules = await deps.pricingRepo.getPreviewRules(defaultPlan.id)
	const minimalRules: MinimalPriceRule[] = parseStrictMinimalRules({
		basePrice,
		rules: dbRules.map((r) => ({ id: r.id, type: r.type, value: Number(r.value) })),
	})

	const finalPrice = computeBasePriceWithRules(basePrice, minimalRules)

	return {
		basePrice,
		finalPrice,
		currency,
	}
}
