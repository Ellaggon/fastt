/**
 * Expedia Partner Central layer vocabulary (via Channex / future OTA).
 *
 * Fastt has no direct Expedia connector. This map locks the Expedia product
 * model cited in the house-rules scope report so content writers cannot mix:
 * Property Policies · Unit attributes · Rate commercial terms.
 */

import type { ChannelContentLayer } from "../channelContentOwnership"

export type ExpediaContentField = {
	layer: ChannelContentLayer
	expediaSurface: string
	fasttSource: string
	notes: string
}

export const EXPEDIA_CONTENT_FIELD_MAP: readonly ExpediaContentField[] = [
	{
		layer: "property",
		expediaSurface: "Property → Policies (pets, smoking default, check-in)",
		fasttSource: "HouseRule scope=product (+ product CheckIn PolicyAssignment)",
		notes: "Guest-facing hotel policies. Default smoking lives here.",
	},
	{
		layer: "unit",
		expediaSurface: "Unit → smoking preference / occupancy / amenities",
		fasttSource: "HouseRule scope=variant Smoking (and rare Pets/Access/…)",
		notes: "Physical space attributes — not hotel regulations, not rate terms.",
	},
	{
		layer: "rate_commercial",
		expediaSurface: "Rate plan → Cancellation, meals, payment, targeting",
		fasttSource: "PolicyAssignment rate_plan Cancellation|Payment|NoShow",
		notes: "Commercial contract. Pets/smoking must not be edited here.",
	},
	{
		layer: "rate_schedule_exception",
		expediaSurface: "Rate plan → inherited check-in with sold schedule exception",
		fasttSource: "PolicyAssignment rate_plan CheckIn (arrival exception)",
		notes: "May sell early/late times; must not rewrite Property Policies pets/smoking.",
	},
] as const

export function expediaSurfacesForLayer(
	layer: ChannelContentLayer
): readonly ExpediaContentField[] {
	return EXPEDIA_CONTENT_FIELD_MAP.filter((row) => row.layer === layer)
}

/** Expedia layers that must remain distinct (guardrail signal). */
export const EXPEDIA_LAYER_SEPARATION = [
	"property_policies",
	"unit_attributes",
	"rate_commercial",
] as const
