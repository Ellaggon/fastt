import { z } from "zod"

import { evaluatePricingRules } from "../../domain/evaluatePricingRules"
import type { Currency } from "../../domain/pricing.types"
import type { BaseRateRepositoryPort } from "../ports/BaseRateRepositoryPort"
import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"

const computePricePreviewSchema = z.object({
	variantId: z.string().trim().min(1),
})

const allowedRuleTypes = new Set([
	"percentage",
	"fixed",
	"override",
	"percentage_markup",
	"percentage_discount",
	"fixed_adjustment",
])

export class PricingPreviewValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "PricingPreviewValidationError"
	}
}

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
	for (const rule of dbRules) {
		const rawType = String(rule.type ?? "").trim()
		if (!allowedRuleTypes.has(rawType)) {
			throw new PricingPreviewValidationError(`Unsupported rule type: ${rawType}`)
		}
	}
	const previewDate = new Date().toISOString().slice(0, 10)
	const finalPrice = evaluatePricingRules({
		basePrice,
		date: previewDate,
		ratePlanId: defaultPlan.id,
		rules: dbRules.map((rule) => {
			const rawType = String(rule.type ?? "").trim()
			const rawValue = Number(rule.value ?? 0)
			let type = rawType
			let value = rawValue
			if (rawType === "percentage") {
				type = rawValue < 0 ? "percentage_discount" : "percentage_markup"
				value = Math.abs(rawValue)
			} else if (rawType === "fixed") {
				type = "override"
			}
			return {
				id: String(rule.id),
				type,
				value,
				priority: 10,
				createdAt: rule.createdAt,
				isActive: true,
			}
		}),
	}).price

	return {
		basePrice,
		finalPrice,
		currency,
	}
}
