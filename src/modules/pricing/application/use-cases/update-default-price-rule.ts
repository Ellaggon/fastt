import { z } from "zod"

import type { BaseRateRepositoryPort } from "../ports/BaseRateRepositoryPort"
import type { PriceRuleCommandRepositoryPort } from "../ports/PriceRuleCommandRepositoryPort"

const updateRuleSchema = z.object({
	ruleId: z.string().trim().min(1),
	ratePlanId: z.string().trim().min(1).optional(),
	variantId: z.string().trim().min(1).optional(),
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

export async function updateDefaultPriceRule(
	deps: {
		baseRateRepo: BaseRateRepositoryPort
		priceRuleCmdRepo: PriceRuleCommandRepositoryPort
	},
	params: {
		ruleId: string
		ratePlanId?: string
		variantId?: string
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
): Promise<{ updated: boolean }> {
	const parsed = updateRuleSchema.parse(params)
	const ratePlanId = String(parsed.ratePlanId ?? "").trim()
	if (!ratePlanId && !parsed.variantId) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["ratePlanId", "variantId"],
				message: "ratePlanId required",
			},
		])
	}
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

	const baseRate = ratePlanId
		? await deps.baseRateRepo.getCanonicalBaseByRatePlanId(ratePlanId)
		: await deps.baseRateRepo.getCanonicalBaseByVariantId(String(parsed.variantId ?? ""))
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

	const updated = await deps.priceRuleCmdRepo.updateById(parsed.ruleId, {
		name: parsed.contextKey ? `ctx:${parsed.contextKey}` : undefined,
		type: canonicalType,
		value: parsed.value,
		priority: Number(parsed.priority ?? 10),
		dateRangeJson: parsed.dateRange ?? null,
		dayOfWeekJson: parsed.dayOfWeek ?? null,
	})

	return { updated: updated === "ok" }
}
