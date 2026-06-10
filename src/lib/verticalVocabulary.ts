import { normalizeProductVertical } from "@/lib/productVerticalRegistry"

export type ProviderVertical = "hotel" | "tour" | "rental" | "package" | "limousine" | "generic"

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
			"Gestiona reglas operativas de venta por alojamiento, habitacion o plan tarifario sin mezclar contenido de catalogo.",
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
			"Gestiona reglas operativas de venta por tour, salida o tarifa sin mezclar contenido de catalogo.",
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
			"Gestiona reglas operativas de venta por propiedad, unidad o tarifa sin mezclar contenido de catalogo.",
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
			"Gestiona reglas operativas de venta por paquete, modalidad o tarifa sin mezclar contenido de catalogo.",
	},
	limousine: {
		vertical: "limousine",
		product: "limusina",
		productPlural: "limusinas",
		variant: "servicio",
		variantPlural: "servicios",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Limusina",
		scopeVariant: "Servicio",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Gestiona reglas operativas de venta por limusina, servicio o tarifa sin mezclar contenido de catalogo.",
	},
	generic: {
		vertical: "generic",
		product: "oferta",
		productPlural: "ofertas",
		variant: "unidad",
		variantPlural: "unidades",
		ratePlan: "tarifa",
		ratePlanPlural: "tarifas",
		scopeProduct: "Oferta",
		scopeVariant: "Unidad",
		scopeRatePlan: "Tarifa",
		contextLine:
			"Gestiona reglas operativas de venta por oferta, unidad vendible o rate plan sin mezclar contenido de catalogo.",
	},
}

export function normalizeVertical(value: unknown): ProviderVertical {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	const productVertical = normalizeProductVertical(raw)
	if (productVertical) return productVertical
	if (raw === "rental" || raw === "rentals" || raw === "vacation_rental") return "rental"
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
