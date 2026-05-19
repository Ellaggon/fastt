export type ProviderVertical = "hotel" | "tour" | "rental" | "package" | "generic"

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

const VOCABULARY: Record<ProviderVertical, VerticalVocabulary> = {
	hotel: {
		vertical: "hotel",
		product: "alojamiento",
		productPlural: "alojamientos",
		variant: "habitacion",
		variantPlural: "habitaciones",
		ratePlan: "plan tarifario",
		ratePlanPlural: "planes tarifarios",
		scopeProduct: "Alojamiento",
		scopeVariant: "Habitacion",
		scopeRatePlan: "Plan tarifario",
		contextLine:
			"Controla cuando se puede vender: Stop Sell, LOS, CTA/CTD y Booking Window por alojamiento, habitacion o plan tarifario.",
	},
	tour: {
		vertical: "tour",
		product: "tour",
		productPlural: "tours",
		variant: "salida",
		variantPlural: "salidas",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Tour",
		scopeVariant: "Salida",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Controla cuando se puede vender: Stop Sell, LOS, CTA/CTD y Booking Window por tour, salida o tarifa.",
	},
	rental: {
		vertical: "rental",
		product: "propiedad",
		productPlural: "propiedades",
		variant: "unidad",
		variantPlural: "unidades",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Propiedad",
		scopeVariant: "Unidad",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Controla cuando se puede vender: Stop Sell, LOS, CTA/CTD y Booking Window por propiedad, unidad o tarifa.",
	},
	package: {
		vertical: "package",
		product: "paquete",
		productPlural: "paquetes",
		variant: "modalidad",
		variantPlural: "modalidades",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Paquete",
		scopeVariant: "Modalidad",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Controla cuando se puede vender: Stop Sell, LOS, CTA/CTD y Booking Window por paquete, modalidad o tarifa.",
	},
	generic: {
		vertical: "generic",
		product: "producto",
		productPlural: "productos",
		variant: "variante",
		variantPlural: "variantes",
		ratePlan: "rate plan",
		ratePlanPlural: "rate plans",
		scopeProduct: "Producto",
		scopeVariant: "Variante",
		scopeRatePlan: "Rate Plan",
		contextLine:
			"Controla cuando se puede vender: Stop Sell, LOS, CTA/CTD y Booking Window por producto, variante o rate plan.",
	},
}

export function normalizeVertical(value: unknown): ProviderVertical {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	if (raw === "hotel" || raw === "hotels" || raw === "lodging") return "hotel"
	if (raw === "tour" || raw === "tours" || raw === "experience") return "tour"
	if (raw === "rental" || raw === "rentals" || raw === "vacation_rental") return "rental"
	if (raw === "package" || raw === "packages") return "package"
	return "generic"
}

export function resolveVerticalVocabulary(productTypes: unknown[]): VerticalVocabulary {
	const verticals = [...new Set(productTypes.map(normalizeVertical))]
	const concrete = verticals.filter((vertical) => vertical !== "generic")
	if (concrete.length === 1) return VOCABULARY[concrete[0]]
	return VOCABULARY.generic
}

export function getVerticalVocabulary(vertical: ProviderVertical = "generic"): VerticalVocabulary {
	return VOCABULARY[vertical]
}
