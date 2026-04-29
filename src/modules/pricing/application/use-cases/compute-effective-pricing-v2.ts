import { createHash } from "node:crypto"

import { evaluatePricingRules } from "../../domain/evaluatePricingRules"
import type {
	EffectivePricingV2ComputationInput,
	PricingBreakdownV2,
} from "../../domain/pricing-v2.types"
import type { Occupancy } from "@/shared/domain/occupancy"
import { normalizeOccupancy } from "@/shared/domain/occupancy"
import { buildOccupancyKey } from "@/modules/search/domain/occupancy-key"

type ActivePolicy = {
	baseAdults: number
	baseChildren: number
	extraAdultMode: "fixed" | "percentage"
	extraAdultValue: number
	childMode: "fixed" | "percentage"
	childValue: number
	currency: string
}

type PreviewRule = {
	id: string
	type: string
	value: number
	occupancyKey?: string | null
	priority: number
	dateRangeJson?: { from?: string | null; to?: string | null } | null
	dayOfWeekJson?: number[] | null
	createdAt: Date
}

export type ComputeEffectivePricingV2Result = {
	occupancyKey: string
	breakdown: PricingBreakdownV2
	currency: string
	sourceVersion: string
}

export async function computeEffectivePricingV2(
	deps: {
		getBaseFromPolicy?: (params: {
			ratePlanId: string
			date: string
			occupancyKey: string
		}) => Promise<{
			baseAmount: number
			baseCurrency: string
		} | null>
		getActiveOccupancyPolicy: (params: {
			ratePlanId: string
			date: string
		}) => Promise<ActivePolicy | null>
		getLegacyEffectivePricingBase: (params: {
			variantId: string
			ratePlanId: string
			date: string
		}) => Promise<{ basePrice: number } | null>
		getPreviewRules: (ratePlanId: string) => Promise<PreviewRule[]>
	},
	input: EffectivePricingV2ComputationInput
): Promise<ComputeEffectivePricingV2Result> {
	const occupancy = normalizeOccupancy(input.occupancy as Occupancy)
	const occupancyKey = buildOccupancyKey(occupancy)

	const policy = await deps.getActiveOccupancyPolicy({
		ratePlanId: input.ratePlanId,
		date: input.date,
	})
	const legacyBase = await deps.getLegacyEffectivePricingBase({
		variantId: input.variantId,
		ratePlanId: input.ratePlanId,
		date: input.date,
	})

	const base = Math.max(0, Number(legacyBase?.basePrice ?? 0))
	const policyOrDefault: ActivePolicy = policy ?? {
		baseAdults: 2,
		baseChildren: 0,
		extraAdultMode: "fixed",
		extraAdultValue: 0,
		childMode: "fixed",
		childValue: 0,
		currency: "USD",
	}

	const occupancyAdjustment = computeOccupancyAdjustment({
		base,
		occupancy,
		policy: policyOrDefault,
	})

	const preRulePrice = Math.max(0, round2(base + occupancyAdjustment))
	const rules = await deps.getPreviewRules(input.ratePlanId)
	const evaluated = evaluatePricingRules({
		basePrice: preRulePrice,
		date: input.date,
		occupancyKey,
		ratePlanId: input.ratePlanId,
		rules: rules.map((rule) => ({
			id: String(rule.id),
			type: String(rule.type),
			value: Number(rule.value),
			occupancyKey: String(rule.occupancyKey ?? "").trim() || null,
			priority: Number(rule.priority ?? 10),
			dateRange: rule.dateRangeJson ?? null,
			dayOfWeek: rule.dayOfWeekJson ?? null,
			createdAt: rule.createdAt,
			isActive: true,
		})),
	})
	const final = Math.max(0, round2(evaluated.price))
	const ruleAdjustment = round2(final - preRulePrice)

	const sourceVersion = createHash("sha1")
		.update(
			JSON.stringify({
				engine: "pricing_v2_shadow",
				variantId: input.variantId,
				ratePlanId: input.ratePlanId,
				date: input.date,
				occupancyKey,
				policy: policyOrDefault,
				base,
				occupancyAdjustment,
				ruleIds: rules.map((rule) => String(rule.id)),
			})
		)
		.digest("hex")

	return {
		occupancyKey,
		breakdown: {
			base: round2(base),
			occupancyAdjustment,
			rules: ruleAdjustment,
			final,
		},
		currency: String(policyOrDefault.currency ?? "USD") || "USD",
		sourceVersion,
	}
}

function computeOccupancyAdjustment(params: {
	base: number
	occupancy: Required<Occupancy>
	policy: ActivePolicy
}): number {
	const extraAdults = Math.max(0, params.occupancy.adults - Math.max(1, params.policy.baseAdults))
	const extraChildren = Math.max(
		0,
		params.occupancy.children - Math.max(0, params.policy.baseChildren)
	)
	const adultAdj =
		params.policy.extraAdultMode === "percentage"
			? (params.base * Math.abs(Number(params.policy.extraAdultValue ?? 0)) * extraAdults) / 100
			: Math.abs(Number(params.policy.extraAdultValue ?? 0)) * extraAdults
	const childAdj =
		params.policy.childMode === "percentage"
			? (params.base * Math.abs(Number(params.policy.childValue ?? 0)) * extraChildren) / 100
			: Math.abs(Number(params.policy.childValue ?? 0)) * extraChildren
	return round2(adultAdj + childAdj)
}

function round2(value: number): number {
	return Number((Number(value) || 0).toFixed(2))
}
