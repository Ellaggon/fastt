import type { RestrictionKey } from "./restrictions.types"

export function isKnownRestriction(key: string): key is RestrictionKey {
	return key in restrictionValidators
}

const restrictionValidators: Record<RestrictionKey, true> = {
	stop_sell: true,
	open_sell: true,
	min_los: true,
	max_los: true,
	min_lead_time: true,
	max_lead_time: true,
	cta: true,
	ctd: true,
}
