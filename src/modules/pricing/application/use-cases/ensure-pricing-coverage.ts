import { z } from "zod"

import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import { recomputeEffectivePricingV2Range } from "./recompute-effective-pricing-v2"

type VariantRepoForCoverage = {
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
	getCapacity?(
		variantId: string
	): Promise<{ maxOccupancy: number; maxAdults: number | null; maxChildren: number | null } | null>
}

const ensurePricingCoverageSchema = z.object({
	variantId: z.string().min(1),
	ratePlanId: z.string().min(1),
	from: z.string().min(1),
	to: z.string().min(1),
	recomputeExisting: z.boolean().optional(),
	occupancy: z
		.object({
			adults: z.number().int().min(1),
			children: z.number().int().min(0).optional(),
			infants: z.number().int().min(0).optional(),
		})
		.optional(),
})

export type EnsurePricingCoverageInput = z.infer<typeof ensurePricingCoverageSchema>

type EnsurePricingCoverageDeps = {
	pricingRepo: PricingRepositoryPort
	variantRepo: VariantRepoForCoverage
	pricingV2Repo: {
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
		countEffectivePricingV2Rows?(params: {
			variantId: string
			ratePlanId: string
			from: string
			to: string
		}): Promise<number>
	}
}

function buildShadowOccupanciesFromCapacity(input?: {
	maxOccupancy?: number | null
	maxAdults?: number | null
	maxChildren?: number | null
	requestedOccupancy?: { adults: number; children: number; infants: number } | null
}): Array<{ adults: number; children: number; infants: number }> {
	const required: Array<{ adults: number; children: number; infants: number }> = [
		{ adults: 1, children: 0, infants: 0 },
		{ adults: 2, children: 0, infants: 0 },
		{ adults: 2, children: 1, infants: 0 },
		{ adults: 3, children: 0, infants: 0 },
	]
	const maxOccupancy = Math.max(1, Number(input?.maxOccupancy ?? 4))
	const maxAdults = Math.max(1, Number(input?.maxAdults ?? maxOccupancy))
	const maxChildren = Math.max(0, Number(input?.maxChildren ?? Math.min(2, maxOccupancy - 1)))
	const out: Array<{ adults: number; children: number; infants: number }> = []
	const seen = new Set<string>()
	const pushUnique = (value: { adults: number; children: number; infants: number }) => {
		if (value.adults < 1) return
		if (value.children < 0) return
		if (value.adults + value.children > maxOccupancy) return
		const key = `${value.adults}:${value.children}:${value.infants}`
		if (seen.has(key)) return
		seen.add(key)
		out.push(value)
	}
	for (const entry of required) pushUnique(entry)
	if (input?.requestedOccupancy) {
		pushUnique(input.requestedOccupancy)
	}
	for (let adults = 1; adults <= maxAdults; adults += 1) {
		for (let children = 0; children <= maxChildren; children += 1) {
			pushUnique({ adults, children, infants: 0 })
		}
	}
	return out.slice(0, 8)
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
	const recomputeExisting = Boolean(parsed.recomputeExisting)

	let generatedDatesCount = 0
	let missingDatesCount = expectedDates.length

	const capacity = await deps.variantRepo.getCapacity?.(parsed.variantId)
	const shadowOccupancies = parsed.occupancy
		? [
				{
					adults: parsed.occupancy.adults,
					children: parsed.occupancy.children ?? 0,
					infants: parsed.occupancy.infants ?? 0,
				},
			]
		: buildShadowOccupanciesFromCapacity({
				maxOccupancy: capacity?.maxOccupancy ?? null,
				maxAdults: capacity?.maxAdults ?? null,
				maxChildren: capacity?.maxChildren ?? null,
				requestedOccupancy: null,
			})
	const occupancyCount = Math.max(1, shadowOccupancies.length)
	const expectedRows = expectedDates.length * occupancyCount
	const currentRows = deps.pricingV2Repo.countEffectivePricingV2Rows
		? await deps.pricingV2Repo.countEffectivePricingV2Rows({
				variantId: parsed.variantId,
				ratePlanId: parsed.ratePlanId,
				from: parsed.from,
				to: parsed.to,
			})
		: 0
	const completeCoverage = currentRows >= expectedRows
	missingDatesCount = completeCoverage ? 0 : expectedDates.length
	const mustRecomputeV2 = recomputeExisting || currentRows < expectedRows
	if (!mustRecomputeV2) {
		return {
			missingDatesCount,
			generatedDatesCount,
		}
	}
	await recomputeEffectivePricingV2Range(
		{
			getBaseFromPolicy: deps.pricingV2Repo.getBaseFromPolicy.bind(deps.pricingV2Repo),
			getActiveOccupancyPolicy: deps.pricingV2Repo.getActiveOccupancyPolicy.bind(
				deps.pricingV2Repo
			),
			getPreviewRules: deps.pricingRepo.getPreviewRules.bind(deps.pricingRepo),
			saveEffectivePricingV2: deps.pricingV2Repo.saveEffectivePricingV2.bind(deps.pricingV2Repo),
		},
		{
			variantId: parsed.variantId,
			ratePlanId: parsed.ratePlanId,
			dates: expectedDates,
			occupancies: shadowOccupancies,
		}
	)
	generatedDatesCount = expectedDates.length
	missingDatesCount = 0

	return {
		missingDatesCount,
		generatedDatesCount,
	}
}
