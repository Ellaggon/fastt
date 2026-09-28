export type CommercialPolicyProductVertical = "hotel" | "tour" | "whole_home"

/**
 * Same two-step decision `assertProductCommercialCapability` already uses.
 * A hotel is diagnosed when rollout is on, or when a caller passes `force`.
 * `forceForTour` still resolves the product first, then exempts every
 * non-tour while rollout is off. This function does not change that order.
 */
export function commercialPolicyEnforcementDecision(params: {
	force?: boolean
	forceForTour?: boolean
	rolloutEnabled: boolean
	vertical?: CommercialPolicyProductVertical | null
}): "skip" | "continue" {
	if (!params.force && !params.forceForTour && !params.rolloutEnabled) return "skip"
	if (
		params.vertical !== undefined &&
		!params.force &&
		params.forceForTour &&
		!params.rolloutEnabled &&
		params.vertical !== "tour"
	) {
		return "skip"
	}
	return "continue"
}
