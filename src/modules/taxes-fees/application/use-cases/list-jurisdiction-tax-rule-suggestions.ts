export type TaxRuleSuggestion = {
	id: string
	country: string
	title: string
	description: string
	reviewNote: string
	draft: {
		kind: "tax" | "fee"
		name: string
		code: string
		calculationType: "percentage" | "fixed"
		appliesPer: "stay" | "night" | "guest" | "guest_night"
		inclusionType: "included" | "excluded"
		collectionResponsibility: "provider" | "platform" | "marketplace"
		country: string
	}
}

const suggestions: TaxRuleSuggestion[] = [
	{
		id: "CL_REVIEW_TAX_PERCENTAGE",
		country: "CL",
		title: "Impuesto porcentual para Chile",
		description: "Plantilla para revisar el tratamiento tributario aplicable a una venta local.",
		reviewNote:
			"Confirma tasa, inclusión, exenciones y responsable de recaudación antes de publicar.",
		draft: {
			kind: "tax",
			name: "Impuesto local por confirmar",
			code: "CL_TAX_REVIEW",
			calculationType: "percentage",
			appliesPer: "stay",
			inclusionType: "included",
			collectionResponsibility: "provider",
			country: "CL",
		},
	},
	{
		id: "BO_REVIEW_TAX_PERCENTAGE",
		country: "BO",
		title: "Impuesto porcentual para Bolivia",
		description: "Plantilla para revisar el tratamiento tributario aplicable a una venta local.",
		reviewNote:
			"Confirma tasa, inclusión, exenciones y responsable de recaudación antes de publicar.",
		draft: {
			kind: "tax",
			name: "Impuesto local por confirmar",
			code: "BO_TAX_REVIEW",
			calculationType: "percentage",
			appliesPer: "stay",
			inclusionType: "included",
			collectionResponsibility: "provider",
			country: "BO",
		},
	},
]

export function listJurisdictionTaxRuleSuggestions(country?: string | null) {
	const normalized = String(country ?? "")
		.trim()
		.toUpperCase()
	return normalized
		? suggestions.filter((suggestion) => suggestion.country === normalized)
		: suggestions
}

export function getJurisdictionTaxRuleSuggestion(id?: string | null) {
	return suggestions.find((suggestion) => suggestion.id === String(id ?? "").trim()) ?? null
}
