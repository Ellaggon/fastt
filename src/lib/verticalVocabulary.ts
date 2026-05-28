import {
	getProductVerticalEntry,
	normalizeProductVertical,
	productVerticalRegistry,
	resolveProductVerticalEntry,
	type ProductVertical,
} from "@/lib/catalog/productVerticalRegistry"

// Compatibility signal for existing Rooms & Rates guardrails:
// hotel => habitacion, tour => salida, hotel rate plan => plan tarifario.
export type ProviderVertical = ProductVertical

export type VerticalVocabulary = {
	vertical: ProviderVertical
	product: string
	productPlural: string
	variant: string
	variantPlural: string
	ratePlan: string
	ratePlanPlural: string
	scopeProduct: string
	scopeVariant: string
	scopeRatePlan: string
	contextLine: string
}

function toVocabulary(vertical: ProviderVertical): VerticalVocabulary {
	const entry = productVerticalRegistry[vertical]
	return {
		vertical: entry.vertical,
		product: entry.labels.singular,
		productPlural: entry.labels.plural,
		variant: entry.labels.variantSingular,
		variantPlural: entry.labels.variantPlural,
		ratePlan: entry.labels.ratePlanSingular,
		ratePlanPlural: entry.labels.ratePlanPlural,
		scopeProduct: entry.labels.scopeProduct,
		scopeVariant: entry.labels.scopeVariant,
		scopeRatePlan: entry.labels.scopeRatePlan,
		contextLine: entry.contextLine,
	}
}

export function normalizeVertical(value: unknown): ProviderVertical {
	return normalizeProductVertical(value)
}

export function resolveVerticalVocabulary(productTypes: unknown[]): VerticalVocabulary {
	return toVocabulary(resolveProductVerticalEntry(productTypes).vertical)
}

export function getVerticalVocabulary(vertical: ProviderVertical = "generic"): VerticalVocabulary {
	return toVocabulary(getProductVerticalEntry(vertical).vertical)
}
