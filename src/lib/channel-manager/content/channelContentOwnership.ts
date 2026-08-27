/**
 * Canonical channel content ownership for hotel inventory.
 *
 * Locks Fastt sources → Expedia/Booking/Channex layers so future content sync
 * (and UI) cannot place property policies, unit smoking, or rate cancellation
 * on the wrong remote object. ARI ID mapping stays separate.
 *
 * @see docs/engineering/adr/0005-channel-content-ownership.md
 */

import {
	HOUSE_RULE_TYPES,
	VARIANT_OVERRIDE_HOUSE_RULE_TYPES,
	type HouseRuleType,
} from "@/modules/house-rules/public"
import { POLICY_CATEGORIES, type PolicyCategory } from "@/modules/policies/public"

export const CHANNEL_CONTENT_LAYERS = [
	"property",
	"unit",
	"rate_commercial",
	"rate_schedule_exception",
] as const

export type ChannelContentLayer = (typeof CHANNEL_CONTENT_LAYERS)[number]

export type ChannelContentSourceKind =
	| "house_rule_product"
	| "house_rule_variant"
	| "policy_assignment_product"
	| "policy_assignment_rate_plan"

export type ChannelContentOwnershipRule = {
	sourceKind: ChannelContentSourceKind
	/** HouseRuleType or PolicyCategory */
	sourceKey: string
	layer: ChannelContentLayer
	/** Human labels used by OTAs / CM (Expedia · Booking · Channex concepts). */
	channelConcepts: readonly string[]
	rationale: string
}

/** Types that must never leave the property (hotel) layer. */
export const PROPERTY_ONLY_HOUSE_RULE_TYPES: readonly HouseRuleType[] = [
	"Children",
	"Parties",
	"QuietHours",
	"Parking",
	"CheckIn",
	"Checkout",
	"Other",
]

/**
 * Unit-layer house rules: physical space attributes OTAs expose on room type /
 * unit (smoking preference is the primary; others are rare overrides).
 */
export const UNIT_LAYER_HOUSE_RULE_TYPES: readonly HouseRuleType[] =
	VARIANT_OVERRIDE_HOUSE_RULE_TYPES

/** Commercial policy categories that belong on the rate plan, never as house rules. */
export const RATE_COMMERCIAL_POLICY_CATEGORIES: readonly PolicyCategory[] = [
	"Cancellation",
	"Payment",
	"NoShow",
]

/** CheckIn PolicyAssignment scope → channel layer. */
export const CHECK_IN_POLICY_LAYER_BY_SCOPE = {
	product: "property",
	rate_plan: "rate_schedule_exception",
} as const satisfies Record<"product" | "rate_plan", ChannelContentLayer>

function productHouseRuleRules(): ChannelContentOwnershipRule[] {
	return HOUSE_RULE_TYPES.map((type) => ({
		sourceKind: "house_rule_product" as const,
		sourceKey: type,
		layer: "property" as const,
		channelConcepts: propertyConceptsFor(type),
		rationale:
			type === "Smoking"
				? "Property default smoking policy (Expedia Policies / Booking House Rules)."
				: type === "CheckIn" || type === "Checkout"
					? "Property check-in/out; synced to PolicyAssignment product CheckIn."
					: "Property-level guest expectation; not a rate commercial term.",
	}))
}

function variantHouseRuleRules(): ChannelContentOwnershipRule[] {
	return VARIANT_OVERRIDE_HOUSE_RULE_TYPES.map((type) => ({
		sourceKind: "house_rule_variant" as const,
		sourceKey: type,
		layer: "unit" as const,
		channelConcepts: unitConceptsFor(type),
		rationale:
			type === "Smoking"
				? "Unit smoking preference (Expedia unit / Booking room type smoking)."
				: "Room-level exception of a property default; never a rate plan attribute.",
	}))
}

function policyAssignmentRules(): ChannelContentOwnershipRule[] {
	const productCheckIn: ChannelContentOwnershipRule = {
		sourceKind: "policy_assignment_product",
		sourceKey: "CheckIn",
		layer: "property",
		channelConcepts: ["property_check_in", "property_check_out"],
		rationale: "Mirror of hotel HouseRule CheckIn/Checkout for conditions resolution.",
	}

	const rateCommercial = RATE_COMMERCIAL_POLICY_CATEGORIES.map((category) => ({
		sourceKind: "policy_assignment_rate_plan" as const,
		sourceKey: category,
		layer: "rate_commercial" as const,
		channelConcepts: rateConceptsFor(category),
		rationale: "Rate commercial terms (Expedia rate / Booking rate cancellation).",
	}))

	const rateSchedule: ChannelContentOwnershipRule = {
		sourceKind: "policy_assignment_rate_plan",
		sourceKey: "CheckIn",
		layer: "rate_schedule_exception",
		channelConcepts: ["rate_arrival_exception", "early_check_in", "late_check_out"],
		rationale:
			"Sold arrival/departure exception on the rate; must not overwrite property policies.",
	}

	return [productCheckIn, ...rateCommercial, rateSchedule]
}

function propertyConceptsFor(type: HouseRuleType): readonly string[] {
	switch (type) {
		case "Smoking":
			return ["property_smoking_policy", "house_rules.smoking"]
		case "Pets":
			return ["property_pets_policy", "house_rules.pets"]
		case "Parties":
			return ["property_parties_policy", "house_rules.events"]
		case "QuietHours":
			return ["property_quiet_hours", "house_rules.quiet_hours"]
		case "CheckIn":
			return ["property_check_in"]
		case "Checkout":
			return ["property_check_out"]
		case "Children":
			return ["property_children_policy"]
		case "Parking":
			return ["property_parking_policy"]
		default:
			return [`property_house_rule.${type}`]
	}
}

function unitConceptsFor(type: HouseRuleType): readonly string[] {
	switch (type) {
		case "Smoking":
			return ["unit_smoking_preference", "room_type.smoking"]
		case "Pets":
			return ["unit_pets_exception"]
		case "ExtraBeds":
			return ["unit_extra_bed"]
		case "Access":
			return ["unit_access_instructions"]
		default:
			return [`unit_house_rule.${type}`]
	}
}

function rateConceptsFor(category: PolicyCategory): readonly string[] {
	switch (category) {
		case "Cancellation":
			return ["rate_cancellation_policy"]
		case "Payment":
			return ["rate_payment_policy"]
		case "NoShow":
			return ["rate_no_show_policy"]
		case "CheckIn":
			return ["rate_arrival_exception"]
		default:
			return [`rate_policy.${category}`]
	}
}

/** Flat ownership table — SoT for mappers, validators, and guardrails. */
export const CHANNEL_CONTENT_OWNERSHIP: readonly ChannelContentOwnershipRule[] = [
	...productHouseRuleRules(),
	...variantHouseRuleRules(),
	...policyAssignmentRules(),
]

export function resolveChannelContentLayer(
	sourceKind: ChannelContentSourceKind,
	sourceKey: string
): ChannelContentLayer | null {
	const key = String(sourceKey ?? "").trim()
	const hit = CHANNEL_CONTENT_OWNERSHIP.find(
		(rule) => rule.sourceKind === sourceKind && rule.sourceKey === key
	)
	return hit?.layer ?? null
}

export function assertChannelContentPlacement(params: {
	sourceKind: ChannelContentSourceKind
	sourceKey: string
	intendedLayer: ChannelContentLayer
}): void {
	const resolved = resolveChannelContentLayer(params.sourceKind, params.sourceKey)
	if (!resolved) {
		throw new Error(`channel_content_unknown_source:${params.sourceKind}:${params.sourceKey}`)
	}
	if (resolved !== params.intendedLayer) {
		throw new Error(
			`channel_content_misplaced:${params.sourceKind}:${params.sourceKey}:expected_${resolved}:got_${params.intendedLayer}`
		)
	}
}

/** Forbidden: commercial categories must never appear as HouseRule types. */
export function isForbiddenHouseRuleCommercialKey(key: string): boolean {
	return (RATE_COMMERCIAL_POLICY_CATEGORIES as readonly string[]).includes(key)
}

/** Forbidden: property-only types must never project as unit attributes. */
export function isForbiddenUnitHouseRuleType(type: HouseRuleType): boolean {
	return !(VARIANT_OVERRIDE_HOUSE_RULE_TYPES as readonly string[]).includes(type)
}

/** Forbidden: any house-rule type on rate commercial (cancellation lives in Policy*). */
export function isForbiddenRateHouseRuleType(type: HouseRuleType): boolean {
	return (HOUSE_RULE_TYPES as readonly string[]).includes(type)
}

export function listOwnershipByLayer(
	layer: ChannelContentLayer
): readonly ChannelContentOwnershipRule[] {
	return CHANNEL_CONTENT_OWNERSHIP.filter((rule) => rule.layer === layer)
}

/** Sanity: every policy category and house-rule type is accounted for. */
export function ownershipCoverageGaps(): string[] {
	const gaps: string[] = []
	for (const type of HOUSE_RULE_TYPES) {
		if (!resolveChannelContentLayer("house_rule_product", type)) {
			gaps.push(`missing_product_house_rule:${type}`)
		}
	}
	for (const type of VARIANT_OVERRIDE_HOUSE_RULE_TYPES) {
		if (!resolveChannelContentLayer("house_rule_variant", type)) {
			gaps.push(`missing_variant_house_rule:${type}`)
		}
	}
	for (const category of POLICY_CATEGORIES) {
		if (category === "CheckIn") {
			if (!resolveChannelContentLayer("policy_assignment_product", "CheckIn")) {
				gaps.push("missing_product_check_in_policy")
			}
			if (!resolveChannelContentLayer("policy_assignment_rate_plan", "CheckIn")) {
				gaps.push("missing_rate_check_in_exception")
			}
			continue
		}
		if (!resolveChannelContentLayer("policy_assignment_rate_plan", category)) {
			gaps.push(`missing_rate_commercial:${category}`)
		}
	}
	return gaps
}
