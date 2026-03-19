import type { RestrictionParamsMap, RestrictionRow } from "./restrictions.types"

export function getRestrictionParams(
	rule: RestrictionRow
): RestrictionParamsMap[keyof RestrictionParamsMap] {
	switch (rule.type) {
		case "min_los":
			return { nights: rule.value }
		case "min_lead_time":
			return { minDays: rule.value }
		case "max_lead_time":
			return { maxDays: rule.value }
		case "stop_sell":
		default:
			return {}
	}
}
