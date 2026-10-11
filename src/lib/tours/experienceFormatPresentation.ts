import type { ExperienceFormat } from "@/shared/domain/experience-format"

type ExperienceFormatPresentation = {
	label: string
	namePlaceholder: string
	descriptionPlaceholder: string
}

export const experienceFormatPresentation = {
	guided_tour: {
		label: "Tour guiado",
		namePlaceholder: "Paseo por el centro histórico de La Paz",
		descriptionPlaceholder: "Describe el recorrido y lo que descubrirán los participantes.",
	},
	workshop: {
		label: "Taller",
		namePlaceholder: "Taller de cerámica artesanal",
		descriptionPlaceholder: "Describe qué crearán o practicarán los participantes.",
	},
	class: {
		label: "Clase",
		namePlaceholder: "Clase de cocina boliviana",
		descriptionPlaceholder: "Describe qué aprenderán y cómo se desarrolla la clase.",
	},
	tasting: {
		label: "Degustación",
		namePlaceholder: "Degustación de sabores locales",
		descriptionPlaceholder: "Describe qué probarán y cómo se desarrolla la degustación.",
	},
} satisfies Record<ExperienceFormat, ExperienceFormatPresentation>

export function getExperienceFormatPresentation(
	format: ExperienceFormat | null | undefined
): ExperienceFormatPresentation {
	return format
		? experienceFormatPresentation[format]
		: {
				label: "Experiencia",
				namePlaceholder: "Escribe un nombre que describa tu experiencia",
				descriptionPlaceholder: "Explica qué harán los participantes y para quién está pensada.",
			}
}

/** Presentation only: an undeclared historical format uses neutral vocabulary. */
export function experienceJourneyPresentation(format: unknown) {
	const guided = format === "guided_tour"
	return {
		logisticsLabel: guided ? "Itinerario y logística" : "Programa y detalles",
		locationLabel: guided ? "Ubicación y encuentro" : "Lugar e indicaciones",
		programAction: guided ? "Completar itinerario" : "Completar programa",
		programLabel: guided ? "Itinerario" : "Programa",
		scheduleAction: guided ? "Programar salidas" : "Programar fechas",
		programPlaceholder:
			format === "guided_tour"
				? "Encuentro y bienvenida\nRecorrido por el centro histórico\nVisita al mirador"
				: format === "workshop"
					? "Preparación de materiales\nCreación de una pieza"
					: format === "class"
						? "Introducción y práctica guiada"
						: format === "tasting"
							? "Presentación y degustación de productos"
							: "Describe qué harán los participantes",
	}
}
