import { randomUUID } from "node:crypto"
import { z } from "zod"

import type { BaseRateRepositoryPort } from "../ports/BaseRateRepositoryPort"
import type { RatePlanCommandRepositoryPort } from "../ports/RatePlanCommandRepositoryPort"
import type { RatePlanRepositoryPort } from "../ports/RatePlanRepositoryPort"
import type { PriceRuleCommandRepositoryPort } from "../ports/PriceRuleCommandRepositoryPort"
import { ensureDefaultRatePlan } from "./ensure-default-rateplan"

const createRuleSchema = z.object({
	variantId: z.string().trim().min(1),
	type: z.enum([
		"base_adjustment",
		"percentage_discount",
		"percentage_markup",
		"fixed_override",
		"fixed_adjustment",
		"percentage",
		"fixed",
		"override",
		"modifier",
	]),
	value: z.number(),
	priority: z.number().int().min(0).max(1000).optional(),
	dateRange: z
		.object({
			from: z.string().trim().min(1).optional(),
			to: z.string().trim().min(1).optional(),
		})
		.optional(),
	dayOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
	contextKey: z.enum(["season", "promotion", "day", "manual"]).optional(),
})

function isValidDateOnly(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
	)
}

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
	params: {
		variantId: string
		type:
			| "base_adjustment"
			| "percentage_discount"
			| "percentage_markup"
			| "fixed_override"
			| "fixed_adjustment"
			| "percentage"
			| "fixed"
			| "override"
			| "modifier"
		value: number
		priority?: number
		dateRange?: { from?: string; to?: string }
		dayOfWeek?: number[]
		contextKey?: "season" | "promotion" | "day" | "manual"
	}
): Promise<{ ruleId: string; ratePlanId: string }> {
	const parsed = createRuleSchema.parse(params)
	const canonicalType =
		parsed.type === "percentage"
			? "percentage_markup"
			: parsed.type === "fixed"
				? "fixed_override"
				: parsed.type === "override"
					? "fixed_override"
					: parsed.type === "modifier"
						? "fixed_adjustment"
						: parsed.type
	const isPercentage =
		canonicalType === "percentage_discount" || canonicalType === "percentage_markup"
	const isFixedLike =
		canonicalType === "fixed_override" ||
		canonicalType === "fixed_adjustment" ||
		canonicalType === "base_adjustment"

	const baseRate = await deps.baseRateRepo.getByVariantId(parsed.variantId)
	const basePrice = Number(baseRate?.basePrice ?? 0)

	if (isPercentage && (parsed.value < 0 || parsed.value > 1000)) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["value"],
				message: "Percentage rule out of bounds (0 to 1000)",
			},
		])
	}

	if (isFixedLike && canonicalType === "fixed_override" && parsed.value < 0) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["value"],
				message: "Fixed override must be >= 0",
			},
		])
	}
	if (isFixedLike && canonicalType !== "fixed_override" && parsed.value < -basePrice) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["value"],
				message: "Fixed adjustment too low for base price",
			},
		])
	}

	const fromValue = parsed.dateRange?.from?.trim()
	const toValue = parsed.dateRange?.to?.trim()
	if (fromValue && !isValidDateOnly(fromValue)) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["dateRange", "from"],
				message: "dateFrom must be YYYY-MM-DD",
			},
		])
	}
	if (toValue && !isValidDateOnly(toValue)) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["dateRange", "to"],
				message: "dateTo must be YYYY-MM-DD",
			},
		])
	}
	if (fromValue && toValue) {
		const fromDate = new Date(`${fromValue}T00:00:00.000Z`)
		const toDate = new Date(`${toValue}T00:00:00.000Z`)
		if (toDate < fromDate) {
			throw new z.ZodError([
				{
					code: "custom",
					path: ["dateRange"],
					message: "dateFrom must be less than or equal to dateTo",
				},
			])
		}
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
		name: parsed.contextKey ? `ctx:${parsed.contextKey}` : null,
		type: canonicalType,
		value: parsed.value,
		priority: Number(parsed.priority ?? 10),
		dateRangeJson: parsed.dateRange ?? null,
		dayOfWeekJson: parsed.dayOfWeek ?? null,
		isActive: true,
		createdAt,
	})

	return { ruleId, ratePlanId }
}
