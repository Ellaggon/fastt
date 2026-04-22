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
			informationalOnly: false,
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
			informationalOnly: false,
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
			informationalOnly: false,
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
			informationalOnly: false,
		},
	},
	{
		code: "pets",
		category: "Pets",
		layer: "INFO",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: false,
			includedInSnapshot: false,
			informationalOnly: true,
		},
	},
	{
		code: "smoking",
		category: "Smoking",
		layer: "INFO",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: false,
			includedInSnapshot: false,
			informationalOnly: true,
		},
	},
	{
		code: "children",
		category: "Children",
		layer: "INFO",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: false,
			includedInSnapshot: false,
			informationalOnly: true,
		},
	},
	{
		code: "extra_beds",
		category: "ExtraBeds",
		layer: "INFO",
		capabilities: {
			affectsSearch: true,
			affectsAvailability: false,
			requiresAcceptance: false,
			includedInSnapshot: false,
			informationalOnly: true,
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
			informationalOnly: false,
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
			informationalOnly: false,
		},
	},
]

const DEFAULT_INFO_CAPABILITIES: RuleCapabilities = {
	affectsSearch: true,
	affectsAvailability: false,
	requiresAcceptance: false,
	includedInSnapshot: false,
	informationalOnly: true,
}

export function getRuleCatalogItem(code: RuleCode): RuleCatalogItem {
	const normalizedCode = String(code ?? "")
		.trim()
		.toLowerCase()
	const found = INITIAL_RULE_CATALOG.find((item) => String(item.code) === normalizedCode)
	if (found) return found
	return {
		code: normalizedCode || "other",
		category: "Other",
		layer: "INFO",
		capabilities: DEFAULT_INFO_CAPABILITIES,
	}
}

export function listInitialRuleCatalog(): RuleCatalogItem[] {
	return [...INITIAL_RULE_CATALOG]
}
