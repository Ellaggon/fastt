import { and, db, EffectivePricing, eq, gte, lt } from "astro:db"
import { z } from "zod"

import { evaluatePricingRules } from "../../domain/evaluatePricingRules"
import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"

type VariantRepoForCoverage = {
	getBaseRate(
		variantId: string
	): Promise<{ variantId: string; currency: string; basePrice: number } | null>
	getDefaultRatePlanWithRules(variantId: string): Promise<{
		ratePlanId: string
		rules: Array<{
			id: string
			type: string
			value: number
			priority: number
			dateRange?: { from?: string | null; to?: string | null } | null
			dayOfWeek?: number[] | null
			createdAt: Date
		}>
	} | null>
}

const ensurePricingCoverageSchema = z.object({
	variantId: z.string().min(1),
	ratePlanId: z.string().min(1),
	from: z.string().min(1),
	to: z.string().min(1),
	recomputeExisting: z.boolean().optional(),
})

export type EnsurePricingCoverageInput = z.infer<typeof ensurePricingCoverageSchema>

type EnsurePricingCoverageDeps = {
	pricingRepo: PricingRepositoryPort
	variantRepo: VariantRepoForCoverage
}

export type EnsurePricingCoverageResult = {
	missingDatesCount: number
	generatedDatesCount: number
}

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function toISODateOnly(value: Date): string {
	return value.toISOString().slice(0, 10)
}

function buildDateRange(from: string, to: string): string[] {
	const start = parseDateOnly(from)
	const end = parseDateOnly(to)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
	const out: string[] = []
	const cursor = new Date(start)
	while (cursor < end) {
		out.push(toISODateOnly(cursor))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

export async function ensurePricingCoverage(
	deps: EnsurePricingCoverageDeps,
	input: EnsurePricingCoverageInput
): Promise<EnsurePricingCoverageResult> {
	const parsed = ensurePricingCoverageSchema.parse(input)
	const expectedDates = buildDateRange(parsed.from, parsed.to)
	if (expectedDates.length === 0) {
		return { missingDatesCount: 0, generatedDatesCount: 0 }
	}

	const existingRows = await db
		.select({ date: EffectivePricing.date })
		.from(EffectivePricing)
		.where(
			and(
				eq(EffectivePricing.variantId, parsed.variantId),
				eq(EffectivePricing.ratePlanId, parsed.ratePlanId),
				gte(EffectivePricing.date, parsed.from),
				lt(EffectivePricing.date, parsed.to)
			)
		)
		.all()
	const existing = new Set(existingRows.map((row) => String(row.date)))
	const missingDates = expectedDates.filter((date) => !existing.has(date))
	const recomputeExisting = Boolean(parsed.recomputeExisting)
	const targetDates = recomputeExisting ? expectedDates : missingDates
	if (targetDates.length === 0) {
		return { missingDatesCount: 0, generatedDatesCount: 0 }
	}

	const [baseRate, defaultPlan] = await Promise.all([
		deps.variantRepo.getBaseRate(parsed.variantId),
		deps.variantRepo.getDefaultRatePlanWithRules(parsed.variantId),
	])
	if (!baseRate || !defaultPlan || defaultPlan.ratePlanId !== parsed.ratePlanId) {
		return { missingDatesCount: missingDates.length, generatedDatesCount: 0 }
	}

	console.warn("pricing_auto_heal_triggered", {
		variantId: parsed.variantId,
		missingDatesCount: missingDates.length,
		from: parsed.from,
		to: parsed.to,
		recomputeExisting,
	})

	let generatedDatesCount = 0
	for (const date of targetDates) {
		const evaluated = evaluatePricingRules({
			basePrice: Number(baseRate.basePrice),
			date,
			ratePlanId: parsed.ratePlanId,
			rules: defaultPlan.rules.map((rule) => ({
				id: String(rule.id),
				type: String(rule.type),
				value: Number(rule.value),
				priority: Number(rule.priority ?? 10),
				dateRange: rule.dateRange ?? null,
				dayOfWeek: rule.dayOfWeek ?? null,
				createdAt: rule.createdAt,
				isActive: true,
			})),
		})
		await deps.pricingRepo.saveEffectivePrice({
			variantId: parsed.variantId,
			ratePlanId: parsed.ratePlanId,
			date,
			basePrice: Number(baseRate.basePrice),
			finalBasePrice: Number(evaluated.price),
		})
		generatedDatesCount += 1
	}

	return {
		missingDatesCount: missingDates.length,
		generatedDatesCount,
	}
}
