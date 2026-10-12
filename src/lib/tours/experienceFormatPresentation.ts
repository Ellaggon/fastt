import { isExperienceFormat, type ExperienceFormat } from "@/shared/domain/experience-format"

type ExperienceFormatPresentation = {
	label: string
	namePlaceholder: string
	descriptionPlaceholder: string
	explanation: string
}

export const experienceFormatPresentation = {
	guided_tour: {
		label: "Visita o recorrido guiado",
		explanation: "Acompañas a los participantes para conocer un lugar o descubrir un entorno.",
		namePlaceholder: "Paseo por el centro histórico de La Paz",
		descriptionPlaceholder: "Describe el recorrido y lo que descubrirán los participantes.",
	},
	workshop: {
		label: "Taller",
		explanation: "Los participantes crean, elaboran o practican algo.",
		namePlaceholder: "Taller de cerámica artesanal",
		descriptionPlaceholder: "Describe qué crearán o practicarán los participantes.",
	},
	class: {
		label: "Clase",
		explanation: "Enseñas conocimientos o técnicas mediante explicación y práctica.",
		namePlaceholder: "Clase de cocina boliviana",
		descriptionPlaceholder: "Describe qué aprenderán y cómo se desarrolla la clase.",
	},
	tasting: {
		label: "Degustación",
		explanation: "Presentas productos que los participantes prueban.",
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
				explanation: "Elige cómo se desarrolla la experiencia.",
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
		programQuestion: guided
			? "¿Qué recorrido realizarán?"
			: format === "workshop"
				? "¿Qué harán o elaborarán?"
				: format === "class"
					? "¿Qué aprenderán y practicarán?"
					: format === "tasting"
						? "¿Qué probarán y cómo se desarrolla?"
						: "¿Qué harán los participantes?",
		includesPlaceholder: guided
			? "Acompañamiento\nEntradas\nTransporte incluido"
			: format === "workshop"
				? "Materiales\nHerramientas\nPieza realizada"
				: format === "class"
					? "Material de práctica\nEquipamiento incluido"
					: format === "tasting"
						? "Productos para degustar\nAcompañamientos incluidos"
						: "Describe qué recibe el participante",
		photosGuidance: guided
			? "Muestra el recorrido, los lugares y la actividad."
			: format === "workshop"
				? "Muestra el espacio, la actividad y un resultado representativo."
				: format === "class"
					? "Muestra la práctica, el espacio y los materiales."
					: format === "tasting"
						? "Muestra los productos y el entorno de la degustación."
						: "Muestra la actividad, el lugar y lo que recibirán los participantes.",
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

/** Historical data stays readable without assigning it a declared format. */
export function experiencePublicPresentation(format: unknown) {
	return {
		formatLabel: isExperienceFormat(format) ? getExperienceFormatPresentation(format).label : null,
		programLabel: experienceJourneyPresentation(format).programLabel,
		locationLabel: format === "guided_tour" ? "Encuentro y recogida" : "Lugar e indicaciones",
		showTourDetails: format == null || format === "guided_tour",
	}
}

/** Only a declared guided tour can describe itself as a TouristTrip. */
export function experienceStructuredData(input: {
	format: unknown
	name: string | null | undefined
	url: string
	description?: string | null
	preview: boolean
}) {
	if (input.preview || input.format !== "guided_tour" || !input.name?.trim()) return undefined
	return {
		"@context": "https://schema.org",
		"@type": "TouristTrip",
		"name": input.name,
		"url": input.url,
		"description": input.description || undefined,
	}
}
