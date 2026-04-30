import { z } from "zod"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

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
	maxOccupancyCombinations: z.number().int().min(1).optional(),
	recomputeChunkSizeDays: z.number().int().min(1).optional(),
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
	pricingV2Repo?: {
		getBaseFromPolicy(params: { ratePlanId: string; date: string; occupancyKey: string }): Promise<{
			baseAmount: number
			currency: string
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
		listEffectivePricingV2Combinations?(params: {
			variantId: string
			ratePlanId: string
			from: string
			to: string
			occupancyKeys?: string[]
		}): Promise<Array<{ date: string; occupancyKey: string }>>
	}
}

function buildShadowOccupanciesFromCapacity(input?: {
	maxOccupancy?: number | null
	maxAdults?: number | null
	maxChildren?: number | null
	requestedOccupancy?: { adults: number; children: number; infants: number } | null
	maxCombinations?: number | null
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
	const maxCombinations = Number(input?.maxCombinations ?? 0)
	if (Number.isFinite(maxCombinations) && maxCombinations > 0) {
		return out.slice(0, Math.trunc(maxCombinations))
	}
	return out
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	if (!items.length) return []
	const size = Math.max(1, Math.trunc(chunkSize))
	const out: T[][] = []
	for (let index = 0; index < items.length; index += size) {
		out.push(items.slice(index, index + size))
	}
	return out
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
	if (!deps.pricingV2Repo) {
		return {
			missingDatesCount: expectedDates.length,
			generatedDatesCount: 0,
		}
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
				maxCombinations: parsed.maxOccupancyCombinations ?? null,
			})
	const occupancyByKey = new Map(
		shadowOccupancies.map((occupancy) => [buildOccupancyKey(occupancy), occupancy] as const)
	)
	const expectedCombinations = new Set<string>()
	for (const date of expectedDates) {
		for (const occupancyKey of occupancyByKey.keys()) {
			expectedCombinations.add(`${date}:${occupancyKey}`)
		}
	}
	const currentRows = deps.pricingV2Repo.listEffectivePricingV2Combinations
		? await deps.pricingV2Repo.listEffectivePricingV2Combinations({
				variantId: parsed.variantId,
				ratePlanId: parsed.ratePlanId,
				from: parsed.from,
				to: parsed.to,
				occupancyKeys: [...occupancyByKey.keys()],
			})
		: []
	const existingCombinations = new Set(currentRows.map((row) => `${row.date}:${row.occupancyKey}`))
	const missingCombinations = recomputeExisting
		? [...expectedCombinations]
		: [...expectedCombinations].filter((combo) => !existingCombinations.has(combo))
	const missingDates = new Set(missingCombinations.map((combo) => combo.split(":")[0]))
	missingDatesCount = missingDates.size
	const mustRecomputeV2 = recomputeExisting || missingCombinations.length > 0
	if (!mustRecomputeV2) {
		return {
			missingDatesCount,
			generatedDatesCount,
		}
	}
	const datesByOccupancy = new Map<string, Set<string>>()
	for (const combination of missingCombinations) {
		const [date, occupancyKey] = combination.split(":")
		const bucket = datesByOccupancy.get(occupancyKey) ?? new Set<string>()
		bucket.add(date)
		datesByOccupancy.set(occupancyKey, bucket)
	}
	for (const [occupancyKey, datesSet] of datesByOccupancy.entries()) {
		const occupancy = occupancyByKey.get(occupancyKey)
		if (!occupancy) continue
		const sortedDates = [...datesSet].sort((a, b) => a.localeCompare(b))
		const dateChunks = chunkArray(sortedDates, parsed.recomputeChunkSizeDays ?? 31)
		for (const dateChunk of dateChunks) {
			await recomputeEffectivePricingV2Range(
				{
					getBaseFromPolicy: deps.pricingV2Repo.getBaseFromPolicy.bind(deps.pricingV2Repo),
					getActiveOccupancyPolicy: deps.pricingV2Repo.getActiveOccupancyPolicy.bind(
						deps.pricingV2Repo
					),
					getPreviewRules: deps.pricingRepo.getPreviewRules.bind(deps.pricingRepo),
					saveEffectivePricingV2: deps.pricingV2Repo.saveEffectivePricingV2.bind(
						deps.pricingV2Repo
					),
				},
				{
					variantId: parsed.variantId,
					ratePlanId: parsed.ratePlanId,
					dates: dateChunk,
					occupancies: [occupancy],
				}
			)
		}
	}
	generatedDatesCount = missingDates.size
	missingDatesCount = 0

	return {
		missingDatesCount,
		generatedDatesCount,
	}
}
