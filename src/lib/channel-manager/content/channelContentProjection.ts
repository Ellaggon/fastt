/**
 * Projects Fastt house rules + policy assignments into channel content layers.
 * Pure — no I/O. Downstream Channex/Expedia writers consume this draft only.
 */

import type { HouseRulePayload, HouseRuleType } from "@/modules/house-rules/public"
import type { PolicyCategory } from "@/modules/policies/public"

import {
	assertChannelContentPlacement,
	isForbiddenHouseRuleCommercialKey,
	isForbiddenUnitHouseRuleType,
	type ChannelContentLayer,
} from "./channelContentOwnership"

export type ChannelHouseRuleInput = {
	type: HouseRuleType
	payload: HouseRulePayload
}

export type ChannelVariantHouseRuleInput = ChannelHouseRuleInput & {
	variantId: string
}

export type ChannelRatePolicyInput = {
	ratePlanId: string
	category: PolicyCategory
	/** Opaque policy payload already validated by Policy* module. */
	content: Record<string, unknown> | null
}

export type ChannelRateArrivalExceptionInput = {
	ratePlanId: string
	checkInFrom: string
	checkInUntil: string
	checkOutUntil: string
}

export type ChannelContentProjectionInput = {
	productId: string
	productHouseRules: readonly ChannelHouseRuleInput[]
	variantHouseRules?: readonly ChannelVariantHouseRuleInput[]
	/** Product-scoped CheckIn PolicyAssignment (hotel arrival mirror). */
	productCheckInPolicy?: Record<string, unknown> | null
	rateCommercialPolicies?: readonly ChannelRatePolicyInput[]
	rateArrivalExceptions?: readonly ChannelRateArrivalExceptionInput[]
}

export type ChannelPropertyContentDraft = {
	layer: "property"
	productId: string
	houseRules: ChannelHouseRuleInput[]
	checkInPolicy: Record<string, unknown> | null
}

export type ChannelUnitContentDraft = {
	layer: "unit"
	variantId: string
	/** Smoking is the primary Expedia/Booking unit attribute. */
	smoking: ChannelHouseRuleInput | null
	otherOverrides: ChannelHouseRuleInput[]
}

export type ChannelRateCommercialDraft = {
	layer: "rate_commercial"
	ratePlanId: string
	cancellation: Record<string, unknown> | null
	payment: Record<string, unknown> | null
	noShow: Record<string, unknown> | null
}

export type ChannelRateScheduleExceptionDraft = {
	layer: "rate_schedule_exception"
	ratePlanId: string
	checkInFrom: string
	checkInUntil: string
	checkOutUntil: string
}

export type ChannelContentDraft = {
	property: ChannelPropertyContentDraft
	units: ChannelUnitContentDraft[]
	rateCommercial: ChannelRateCommercialDraft[]
	rateScheduleExceptions: ChannelRateScheduleExceptionDraft[]
}

function rejectCommercialAsHouseRule(type: string): void {
	if (isForbiddenHouseRuleCommercialKey(type)) {
		throw new Error(`channel_content_forbidden:house_rule_commercial:${type}`)
	}
}

export function projectChannelContent(input: ChannelContentProjectionInput): ChannelContentDraft {
	const productHouseRules: ChannelHouseRuleInput[] = []
	for (const rule of input.productHouseRules) {
		rejectCommercialAsHouseRule(rule.type)
		assertChannelContentPlacement({
			sourceKind: "house_rule_product",
			sourceKey: rule.type,
			intendedLayer: "property",
		})
		productHouseRules.push(rule)
	}

	if (input.productCheckInPolicy) {
		assertChannelContentPlacement({
			sourceKind: "policy_assignment_product",
			sourceKey: "CheckIn",
			intendedLayer: "property",
		})
	}

	const byVariant = new Map<string, ChannelVariantHouseRuleInput[]>()
	for (const rule of input.variantHouseRules ?? []) {
		rejectCommercialAsHouseRule(rule.type)
		if (isForbiddenUnitHouseRuleType(rule.type)) {
			throw new Error(`channel_content_forbidden:unit_property_only:${rule.type}`)
		}
		assertChannelContentPlacement({
			sourceKind: "house_rule_variant",
			sourceKey: rule.type,
			intendedLayer: "unit",
		})
		const list = byVariant.get(rule.variantId) ?? []
		list.push(rule)
		byVariant.set(rule.variantId, list)
	}

	const units: ChannelUnitContentDraft[] = [...byVariant.entries()].map(([variantId, rules]) => {
		const smoking = rules.find((r) => r.type === "Smoking") ?? null
		const otherOverrides = rules.filter((r) => r.type !== "Smoking")
		return {
			layer: "unit" as const,
			variantId,
			smoking: smoking ? { type: smoking.type, payload: smoking.payload } : null,
			otherOverrides: otherOverrides.map((r) => ({
				type: r.type,
				payload: r.payload,
			})),
		}
	})

	const rateById = new Map<string, ChannelRateCommercialDraft>()
	for (const row of input.rateCommercialPolicies ?? []) {
		if (row.category === "CheckIn") {
			throw new Error("channel_content_misplaced:rate_check_in_must_use_schedule_exception")
		}
		assertChannelContentPlacement({
			sourceKind: "policy_assignment_rate_plan",
			sourceKey: row.category,
			intendedLayer: "rate_commercial",
		})
		const draft =
			rateById.get(row.ratePlanId) ??
			({
				layer: "rate_commercial" as const,
				ratePlanId: row.ratePlanId,
				cancellation: null,
				payment: null,
				noShow: null,
			} satisfies ChannelRateCommercialDraft)
		if (row.category === "Cancellation") draft.cancellation = row.content
		if (row.category === "Payment") draft.payment = row.content
		if (row.category === "NoShow") draft.noShow = row.content
		rateById.set(row.ratePlanId, draft)
	}

	const rateScheduleExceptions: ChannelRateScheduleExceptionDraft[] = []
	for (const row of input.rateArrivalExceptions ?? []) {
		assertChannelContentPlacement({
			sourceKind: "policy_assignment_rate_plan",
			sourceKey: "CheckIn",
			intendedLayer: "rate_schedule_exception",
		})
		rateScheduleExceptions.push({
			layer: "rate_schedule_exception",
			ratePlanId: row.ratePlanId,
			checkInFrom: row.checkInFrom,
			checkInUntil: row.checkInUntil,
			checkOutUntil: row.checkOutUntil,
		})
	}

	return {
		property: {
			layer: "property",
			productId: input.productId,
			houseRules: productHouseRules,
			checkInPolicy: input.productCheckInPolicy ?? null,
		},
		units,
		rateCommercial: [...rateById.values()],
		rateScheduleExceptions,
	}
}

export function layersPresentInDraft(draft: ChannelContentDraft): ChannelContentLayer[] {
	const layers: ChannelContentLayer[] = ["property"]
	if (draft.units.length) layers.push("unit")
	if (draft.rateCommercial.length) layers.push("rate_commercial")
	if (draft.rateScheduleExceptions.length) layers.push("rate_schedule_exception")
	return layers
}
