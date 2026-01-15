import type { OperationalRuleParamsMap } from "./operational-rules.types"

export function isKnownPreset(key: string): key is keyof OperationalRuleParamsMap {
	return key in presetValidators
}

const presetValidators: Record<keyof OperationalRuleParamsMap, true> = {
	stop_sell: true,
	min_los: true,
	booking_window: true,
}
