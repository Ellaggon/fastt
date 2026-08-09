import type { ChannelManagerRateRestrictionUpdate } from "@/lib/channel-manager/channel-manager-adapter"

/** Resolves the Channex min-stay field supported by this property. */
export function minStayUpdateForProperty(
	minStay: number,
	minStayType: "arrival" | "through" | "both" | null | undefined
): Pick<ChannelManagerRateRestrictionUpdate, "minStayArrival" | "minStayThrough" | "minStay"> {
	if (minStayType === "arrival") return { minStayArrival: minStay }
	if (minStayType === "through") return { minStayThrough: minStay }
	if (minStayType === "both") return { minStayArrival: minStay, minStayThrough: minStay }
	return { minStay }
}
