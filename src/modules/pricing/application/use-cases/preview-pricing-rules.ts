import { z } from "zod"

import { evaluatePricingRules } from "../../domain/evaluatePricingRules"

type VariantRepoForRulePreview = {
	getBaseRateByRatePlanId?(
		ratePlanId: string
	): Promise<{ ratePlanId: string; currency: string; basePrice: number } | null>
	getPreviewRulesByRatePlanId(ratePlanId: string): Promise<
		Array<{
			id: string
			type: string
			value: number
			occupancyKey?: string | null
			priority: number
			dateRange?: { from?: string | null; to?: string | null } | null
			dayOfWeek?: number[] | null
			createdAt: Date
		}>
	>
}

const previewPricingRulesSchema = z.object({
	ratePlanId: z.string().trim().min(1).optional(),
	variantId: z.string().trim().min(1).optional(),
	candidateRule: z.object({
		type: z.string().trim().min(1),
		value: z.number(),
		priority: z.number().int().min(0).max(1000).default(10),
		dateRange: z
			.object({
				from: z.string().trim().min(1).optional(),
				to: z.string().trim().min(1).optional(),
			})
			.optional(),
		dayOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
	}),
	from: z.string().trim().min(1),
	to: z.string().trim().min(1),
})

export type PreviewPricingRulesInput = z.infer<typeof previewPricingRulesSchema>

export async function previewPricingRules(
	deps: {
		variantRepo: VariantRepoForRulePreview
	},
	params: PreviewPricingRulesInput
) {
	const parsed = previewPricingRulesSchema.parse(params)
	const ratePlanId = String(parsed.ratePlanId ?? "").trim()
	if (!ratePlanId) {
		throw new Error("ratePlanId_required")
	}
	if (!deps.variantRepo.getBaseRateByRatePlanId || !deps.variantRepo.getPreviewRulesByRatePlanId) {
		throw new Error("ratePlan_read_contract_required")
	}
	const [baseRate, rules] = await Promise.all([
		deps.variantRepo.getBaseRateByRatePlanId(ratePlanId),
		deps.variantRepo.getPreviewRulesByRatePlanId(ratePlanId),
	])
	if (!baseRate) {
		return {
			basePrice: 0,
			currency: "USD",
			ratePlanId,
			days: [],
		}
	}

	const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`)
	const start = toDate(parsed.from)
	const end = toDate(parsed.to)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
		throw new Error("invalid_date_range")
	}

	const normalizeType = (value: string) => {
		if (value === "percentage") return "percentage_markup"
		if (value === "fixed" || value === "override") return "fixed_override"
		if (value === "modifier") return "fixed_adjustment"
		return value
	}

	const candidate = {
		id: "__candidate__",
		type: normalizeType(parsed.candidateRule.type),
		value: Number(parsed.candidateRule.value),
		priority: Number(parsed.candidateRule.priority ?? 10),
		dateRange: parsed.candidateRule.dateRange ?? null,
		dayOfWeek: parsed.candidateRule.dayOfWeek ?? null,
		createdAt: new Date(),
		isActive: true,
	}

	const basePrice = Number(baseRate.basePrice)
	const existingRules = rules.map((rule) => ({
		id: String(rule.id),
		type: normalizeType(String(rule.type)),
		value: Number(rule.value),
		occupancyKey: String(rule.occupancyKey ?? "").trim() || null,
		priority: Number(rule.priority ?? 10),
		dateRange: rule.dateRange ?? null,
		dayOfWeek: rule.dayOfWeek ?? null,
		createdAt: rule.createdAt,
		isActive: true,
	}))

	const days: Array<{
		date: string
		before: number
		after: number
		delta: number
		appliedRuleIds: string[]
	}> = []
	const cursor = new Date(start)
	while (cursor < end) {
		const date = cursor.toISOString().slice(0, 10)
		const beforeEval = evaluatePricingRules({
			basePrice,
			date,
			ratePlanId,
			rules: existingRules,
		})
		const afterEval = evaluatePricingRules({
			basePrice,
			date,
			ratePlanId,
			rules: [...existingRules, candidate],
		})
		days.push({
			date,
			before: Number(beforeEval.price),
			after: Number(afterEval.price),
			delta: Number((afterEval.price - beforeEval.price).toFixed(2)),
			appliedRuleIds: afterEval.appliedRuleIds,
		})
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}

	return {
		basePrice,
		currency: baseRate.currency,
		ratePlanId,
		days,
	}
}
