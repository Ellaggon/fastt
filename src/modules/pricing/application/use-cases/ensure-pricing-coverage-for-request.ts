import { z } from "zod"
import {
	buildOccupancyKey as buildCanonicalOccupancyKey,
	normalizeOccupancy,
	type Occupancy,
} from "@/shared/domain/occupancy"

import type { PricingRepositoryPort } from "../ports/PricingRepositoryPort"
import { ensurePricingCoverage } from "./ensure-pricing-coverage"

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

type PricingV2CoverageRepo = {
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

export async function ensurePricingCoverageForRequest(
	deps: {
		pricingRepo: PricingRepositoryPort
		variantRepo: VariantRepoForCoverage
		pricingV2Repo: PricingV2CoverageRepo
	},
	params: {
		variantId: string
		ratePlanId: string
		checkIn: string
		checkOut: string
		occupancy: Occupancy
	}
) {
	const parsed = requestCoverageSchema.parse(params)
	const occupancy = normalizeOccupancy(parsed.occupancy)
	const occupancyKey = buildCanonicalOccupancyKey(occupancy)
	const coverage = await ensurePricingCoverage(
		{
			pricingRepo: deps.pricingRepo,
			variantRepo: deps.variantRepo,
			pricingV2Repo: deps.pricingV2Repo,
		},
		{
			variantId: parsed.variantId,
			ratePlanId: parsed.ratePlanId,
			from: parsed.checkIn,
			to: parsed.checkOut,
			recomputeExisting: true,
			occupancy,
		}
	)
	return {
		...coverage,
		occupancy,
		occupancyKey,
	}
}

const requestCoverageSchema = z
	.object({
		variantId: z.string().min(1),
		ratePlanId: z.string().min(1),
		checkIn: z.string().min(1),
		checkOut: z.string().min(1),
		occupancy: z.object({
			adults: z.number().int().min(1),
			children: z.number().int().min(0),
			infants: z.number().int().min(0),
		}),
	})
	.superRefine((value, ctx) => {
		const from = Date.parse(`${value.checkIn}T00:00:00.000Z`)
		const to = Date.parse(`${value.checkOut}T00:00:00.000Z`)
		if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
			ctx.addIssue({
				code: "custom",
				message: "checkOut must be greater than checkIn",
				path: ["checkOut"],
			})
		}
	})
