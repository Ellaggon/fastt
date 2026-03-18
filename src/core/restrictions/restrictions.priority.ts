import type { RestrictionScope, RestrictionKey } from "./restrictions.types"

export const SCOPE_WEIGHTS: Record<RestrictionScope, number> = {
	product: 300,
	variant: 200,
	rate_plan: 100,
}

export const RULE_WEIGHTS: Partial<Record<RestrictionKey, number>> = {
	stop_sell: 0,
	open_sell: 5,

	min_los: 50,
	max_los: 50,

	min_lead_time: 80,
	max_lead_time: 80,

	cta: 40,
	ctd: 40,
}

export function computeRestrictionPriority(scope: RestrictionScope, type: RestrictionKey): number {
	return (SCOPE_WEIGHTS[scope] ?? 999) + (RULE_WEIGHTS[type] ?? 100)
}
