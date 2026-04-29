import { z } from "zod"

import { evaluatePricingRules } from "../../domain/evaluatePricingRules"
import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import { recomputeEffectivePricingV2Range } from "./recompute-effective-pricing-v2"

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
			occupancyKey?: string | null
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
	pricingV2Repo?: {
		getBaseFromPolicy(params: { ratePlanId: string; date: string; occupancyKey: string }): Promise<{
			baseAmount: number
			baseCurrency: string
		} | null>
		getActiveOccupancyPolicy(params: { ratePlanId: string; date: string }): Promise<{
			baseAdults: number
			baseChildren: number
			extraAdultMode: "fixed" | "percentage"
			extraAdultValue: number
			childMode: "fixed" | "percentage"
			childValue: number
			currency: string
		} | null>
		getLegacyEffectivePricingBase(params: {
			variantId: string
			ratePlanId: string
			date: string
		}): Promise<{ basePrice: number } | null>
		saveEffectivePricingV2(params: {
			id: string
			variantId: string
			ratePlanId: string
			date: string
			occupancyKey: string
			baseComponent: number
			occupancyAdjustment: number
			ruleAdjustment: number
			finalBasePrice: number
			currency: string
			computedAt: Date
			sourceVersion: string
		}): Promise<void>
	}
}

function buildShadowOccupanciesFromCapacity(input?: {
	maxOccupancy?: number | null
	maxAdults?: number | null
	maxChildren?: number | null
}): Array<{ adults: number; children: number; infants: number }> {
	const maxOccupancy = Math.max(1, Number(input?.maxOccupancy ?? 4))
	const maxAdults = Math.max(1, Number(input?.maxAdults ?? maxOccupancy))
	const maxChildren = Math.max(0, Number(input?.maxChildren ?? Math.min(2, maxOccupancy - 1)))
	const out: Array<{ adults: number; children: number; infants: number }> = []
	for (let adults = 1; adults <= maxAdults; adults += 1) {
		for (let children = 0; children <= maxChildren; children += 1) {
			if (adults + children > maxOccupancy) continue
			out.push({ adults, children, infants: 0 })
		}
	}
	// Safety cap to avoid combinatorial explosion on outlier capacity definitions.
	return out.slice(0, 20)
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

	const existing = new Set(
		await deps.pricingRepo.listEffectivePricingDates({
			variantId: parsed.variantId,
			ratePlanId: parsed.ratePlanId,
			from: parsed.from,
			to: parsed.to,
		})
	)
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
				occupancyKey: String(rule.occupancyKey ?? "").trim() || null,
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

	if (deps.pricingV2Repo && targetDates.length > 0) {
		const capacity = await (deps.variantRepo as any)?.getCapacity?.(parsed.variantId)
		const shadowOccupancies = buildShadowOccupanciesFromCapacity({
			maxOccupancy: capacity?.maxOccupancy ?? null,
			maxAdults: capacity?.maxAdults ?? null,
			maxChildren: capacity?.maxChildren ?? null,
		})
		await recomputeEffectivePricingV2Range(
			{
				getActiveOccupancyPolicy: deps.pricingV2Repo.getActiveOccupancyPolicy.bind(
					deps.pricingV2Repo
				),
				getLegacyEffectivePricingBase: deps.pricingV2Repo.getLegacyEffectivePricingBase.bind(
					deps.pricingV2Repo
				),
				getPreviewRules: deps.pricingRepo.getPreviewRules.bind(deps.pricingRepo),
				saveEffectivePricingV2: deps.pricingV2Repo.saveEffectivePricingV2.bind(deps.pricingV2Repo),
			},
			{
				variantId: parsed.variantId,
				ratePlanId: parsed.ratePlanId,
				dates: targetDates,
				occupancies: shadowOccupancies,
			}
		)
	}

	return {
		missingDatesCount: missingDates.length,
		generatedDatesCount,
	}
}
