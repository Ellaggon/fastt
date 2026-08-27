import type {
	GuestStayExpectationSnapshotRule,
	GuestStayExpectationsSnapshot,
} from "../domain/guestStayExpectationsSnapshot"

export type GuestHouseRulesDisplay = {
	rules: GuestStayExpectationSnapshotRule[]
	overrideTypes: Set<string>
	hasRoomContext: boolean
	hasRoomOverrides: boolean
}

export function buildGuestHouseRulesDisplay(params: {
	hotelSnapshot: GuestStayExpectationsSnapshot | null
	roomSnapshot?: GuestStayExpectationsSnapshot | null
}): GuestHouseRulesDisplay {
	const hotelRules = params.hotelSnapshot?.rules ?? []
	const rules = params.roomSnapshot?.rules ?? hotelRules
	const overrideTypes = new Set(
		rules.filter((rule) => rule.source === "override").map((rule) => rule.type)
	)
	return {
		rules,
		overrideTypes,
		hasRoomContext: Boolean(params.roomSnapshot?.variantId),
		hasRoomOverrides: overrideTypes.size > 0,
	}
}
