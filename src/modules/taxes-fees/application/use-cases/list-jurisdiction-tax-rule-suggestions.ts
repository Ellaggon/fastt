export type TaxRuleSuggestion = {
	id: string
	country: string
	region?: string
	city?: string
	serviceType: "lodging" | "tour" | "all"
	title: string
	description: string
	reviewNote: string
	sourceName: string
	sourceUrl: string
	consultedAt: string
	effectiveFrom: string
	suggestedRate: number | null
	taxableBase: "booking_base" | "base_plus_included"
	exemptions: string[]
	maxAmount: number | null
	maxNights: number | null
	seasons: Array<{ from: string; to: string; value?: number | null }>
	collectionResponsibility: "provider" | "platform" | "marketplace"
	confidence: "low" | "medium" | "high"
	version: string
	status: "new" | "possible_update" | "regulatory_conflict" | "dismissed" | "applied"
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
		id: "CL_REVIEW_TAX_PERCENTAGE_V1",
		country: "CL",
		serviceType: "lodging",
		title: "Revisión de IVA para alojamiento en Chile",
		description: "Referencia para revisar el tratamiento local antes de usarlo comercialmente.",
		reviewNote:
			"Verifica tasa, residencia del huésped, inclusión y alcance con asesoría local. Esta sugerencia no constituye asesoría legal.",
		sourceName: "Servicio de Impuestos Internos de Chile",
		sourceUrl: "https://www.sii.cl/",
		consultedAt: "2026-08-11",
		effectiveFrom: "2026-01-01",
		suggestedRate: 19,
		taxableBase: "booking_base",
		exemptions: ["Residencia extranjera cuando corresponda"],
		maxAmount: null,
		maxNights: null,
		seasons: [],
		collectionResponsibility: "provider",
		confidence: "medium",
		version: "2026.1",
		status: "new",
		draft: {
			kind: "tax",
			name: "IVA alojamiento - por revisar",
			code: "CL_VAT_REVIEW",
			calculationType: "percentage",
			appliesPer: "stay",
			inclusionType: "included",
			collectionResponsibility: "provider",
			country: "CL",
		},
	},
	{
		id: "BO_REVIEW_TAX_PERCENTAGE_V1",
		country: "BO",
		serviceType: "all",
		title: "Revisión de impuesto para ventas en Bolivia",
		description: "Plantilla de revisión para una regla comercial local.",
		reviewNote:
			"Confirma la tasa efectiva, exenciones y obligación de recaudo antes de simular y publicar.",
		sourceName: "Servicio de Impuestos Nacionales de Bolivia",
		sourceUrl: "https://www.impuestos.gob.bo/",
		consultedAt: "2026-08-11",
		effectiveFrom: "2026-01-01",
		suggestedRate: null,
		taxableBase: "booking_base",
		exemptions: [],
		maxAmount: null,
		maxNights: null,
		seasons: [],
		collectionResponsibility: "provider",
		confidence: "low",
		version: "2026.1",
		status: "new",
		draft: {
			kind: "tax",
			name: "Impuesto local - por revisar",
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
