/**
 * Channex conceptual content field map.
 *
 * Channex today is used for ARI + entity ID maps only. This dictionary documents
 * where Fastt layers would land if/when property/room/rate *content* sync is
 * certified — it does not call HTTP.
 *
 * @see https://docs.channex.io (property / room_type / rate_plan resources)
 */

import type { ChannelContentLayer } from "../channelContentOwnership"

export type ChannexContentField = {
	layer: ChannelContentLayer
	/** Conceptual Channex attribute / payload path (not a live schema guarantee). */
	channexField: string
	fasttSource: string
	notes: string
}

/**
 * Stable vocabulary for future Channex content writers.
 * Field names are intentional stubs aligned to common CM + OTA semantics.
 */
export const CHANNEX_CONTENT_FIELD_MAP: readonly ChannexContentField[] = [
	{
		layer: "property",
		channexField: "property.policies.smoking",
		fasttSource: "HouseRule product Smoking",
		notes: "Property default; do not write variant smoking here.",
	},
	{
		layer: "property",
		channexField: "property.policies.pets",
		fasttSource: "HouseRule product Pets",
		notes: "Property pets policy / house rules.",
	},
	{
		layer: "property",
		channexField: "property.policies.checkin_from",
		fasttSource: "HouseRule product CheckIn + PolicyAssignment product CheckIn",
		notes: "Property arrival window; rate exceptions stay on rate_plan.",
	},
	{
		layer: "property",
		channexField: "property.policies.checkout_until",
		fasttSource: "HouseRule product Checkout",
		notes: "Property departure default.",
	},
	{
		layer: "unit",
		channexField: "room_type.smoking",
		fasttSource: "HouseRule variant Smoking",
		notes: "Unit smoking preference (Expedia/Booking room attribute).",
	},
	{
		layer: "unit",
		channexField: "room_type.facilities.extra_bed",
		fasttSource: "HouseRule variant ExtraBeds",
		notes: "Physical room capability, not a rate commercial term.",
	},
	{
		layer: "rate_commercial",
		channexField: "rate_plan.cancellation_policy",
		fasttSource: "PolicyAssignment rate_plan Cancellation",
		notes: "Never map HouseRule Smoking/Pets onto rate_plan.",
	},
	{
		layer: "rate_commercial",
		channexField: "rate_plan.payment_policy",
		fasttSource: "PolicyAssignment rate_plan Payment",
		notes: "Commercial payment terms on the rate.",
	},
	{
		layer: "rate_commercial",
		channexField: "rate_plan.no_show_policy",
		fasttSource: "PolicyAssignment rate_plan NoShow",
		notes: "Commercial no-show terms on the rate.",
	},
	{
		layer: "rate_schedule_exception",
		channexField: "rate_plan.arrival_exception",
		fasttSource: "PolicyAssignment rate_plan CheckIn",
		notes: "Sold early check-in / late checkout; must not PATCH property.policies.",
	},
] as const

export function channexFieldsForLayer(layer: ChannelContentLayer): readonly ChannexContentField[] {
	return CHANNEX_CONTENT_FIELD_MAP.filter((row) => row.layer === layer)
}
