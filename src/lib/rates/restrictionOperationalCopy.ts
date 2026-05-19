import type { SellabilityRuleType } from "@/lib/rates/restrictionsSurface"
import type { VerticalVocabulary } from "@/lib/verticalVocabulary"

export type RestrictionOperationalCopyTemplate = {
	impact: string
	example: string
	nonEffect?: string
}

export type RestrictionOperationalCopyRegistry = Record<
	SellabilityRuleType,
	RestrictionOperationalCopyTemplate
>

export function buildRestrictionOperationalCopyRegistry(
	vocabulary: VerticalVocabulary
): RestrictionOperationalCopyRegistry {
	const ratePlan = vocabulary.ratePlan
	const variant = vocabulary.variant

	return {
		stop_sell: {
			impact: "Cierra la venta para el alcance y fechas seleccionadas.",
			example: `Si una busqueda toca el rango, este ${ratePlan} no se muestra vendible.`,
			nonEffect: "No cambia cupos fisicos ni reservas existentes.",
		},
		min_los: {
			impact: "Exige una estadia minima para llegadas aplicables.",
			example: "Con {{value}} noches, busquedas mas cortas no seran vendibles.",
			nonEffect: "No cambia el precio ni la disponibilidad fisica.",
		},
		max_los: {
			impact: "Limita la estadia maxima para llegadas aplicables.",
			example: "Con {{value}} noches maximas, busquedas mas largas no seran vendibles.",
			nonEffect: "No cambia el precio ni la disponibilidad fisica.",
		},
		cta: {
			impact: "Bloquea llegadas en las fechas seleccionadas.",
			example: "Una busqueda con check-in dentro del rango queda bloqueada.",
			nonEffect: "Una estadia iniciada antes puede seguir siendo valida.",
		},
		ctd: {
			impact: "Bloquea salidas en las fechas seleccionadas.",
			example: "Una busqueda con check-out dentro del rango queda bloqueada.",
			nonEffect: "No bloquea necesariamente el check-in.",
		},
		min_lead_time: {
			impact: "Exige reservar con anticipacion minima.",
			example: "Con {{value}} dias, reservas hechas con menos anticipacion quedan bloqueadas.",
			nonEffect: "No afecta reservas ya creadas.",
		},
		max_lead_time: {
			impact: "Evita reservas hechas con demasiada anticipacion.",
			example: "Con {{value}} dias, reservas hechas mas alla de esa ventana quedan bloqueadas.",
			nonEffect: `No cambia la configuracion base de ${variant}.`,
		},
	}
}
