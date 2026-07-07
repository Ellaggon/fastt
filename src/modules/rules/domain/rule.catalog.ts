import type { RuleCapabilities, RuleCode, RuleLayer } from "./rule.types"

type RuleCatalogItem = {
	code: RuleCode
	category: string
	layer: RuleLayer
	capabilities: RuleCapabilities
}

export const INITIAL_RULE_CATALOG: readonly RuleCatalogItem[] = [
	{
		code: "cancellation",
		category: "Cancellation",
		layer: "CONTRACT",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: true,
			includedInSnapshot: true,
		},
	},
	{
		code: "payment",
		category: "Payment",
		layer: "CONTRACT",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: true,
			includedInSnapshot: true,
		},
	},
	{
		code: "no_show",
		category: "NoShow",
		layer: "CONTRACT",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: true,
			includedInSnapshot: true,
		},
	},
	{
		code: "check_in",
		category: "CheckIn",
		layer: "CONTRACT",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: true,
			includedInSnapshot: true,
		},
	},
	{
		code: "min_stay",
		category: "MinStay",
		layer: "HARD",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: true,
			requiresAcceptance: false,
			includedInSnapshot: true,
		},
	},
	{
		code: "stop_sell",
		category: "StopSell",
		layer: "HARD",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: true,
			requiresAcceptance: false,
			includedInSnapshot: true,
		},
	},
]

const DEFAULT_CONTRACT_CAPABILITIES: RuleCapabilities = {
	affectsSearch: true,
	affectsAvailability: false,
	requiresAcceptance: true,
	includedInSnapshot: true,
}

export function getRuleCatalogItem(code: RuleCode): RuleCatalogItem {
	const normalizedCode = String(code ?? "")
		.trim()
		.toLowerCase()
	const found = INITIAL_RULE_CATALOG.find((item) => String(item.code) === normalizedCode)
	if (found) return found
	return {
		code: normalizedCode || "other",
		category: "CheckIn",
		layer: "CONTRACT",
		capabilities: DEFAULT_CONTRACT_CAPABILITIES,
	}
}

export function listInitialRuleCatalog(): RuleCatalogItem[] {
	return [...INITIAL_RULE_CATALOG]
}
