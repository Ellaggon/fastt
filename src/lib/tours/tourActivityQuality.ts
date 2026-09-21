export type TourActivityQualityCriterion = {
	id: string
	label: string
	detail: string
	hrefSection: "subtype" | "location" | "tickets" | "photos"
}

const BASE_CRITERIA: TourActivityQualityCriterion[] = [
	{
		id: "representative-photos",
		label: "Fotos representativas",
		detail: "Muestra la actividad, el entorno y lo que recibirá el viajero.",
		hrefSection: "photos",
	},
	{
		id: "meeting-instructions",
		label: "Encuentro reconocible",
		detail: "Distingue el destino de búsqueda del punto exacto donde comienza la experiencia.",
		hrefSection: "location",
	},
]

const ACTIVITY_RULES: Array<{
	match: RegExp
	criteria: TourActivityQualityCriterion[]
}> = [
	{
		match: /aventura|trek|sender|camin|monta|bicicl|outdoor|naturaleza/,
		criteria: [
			{
				id: "physical-demand",
				label: "Exigencia física y seguridad",
				detail: "Explica dificultad, preparación necesaria, equipo y restricciones físicas.",
				hrefSection: "subtype",
			},
		],
	},
	{
		match: /agua|buce|kayak|rafting|naveg|mar|playa/,
		criteria: [
			{
				id: "water-safety",
				label: "Seguridad y equipamiento acuático",
				detail:
					"Aclara equipo incluido, requisitos de seguridad y condiciones que pueden cancelar la actividad.",
				hrefSection: "subtype",
			},
		],
	},
	{
		match: /gastronom|comida|vino|culin|food|cocina/,
		criteria: [
			{
				id: "dietary-needs",
				label: "Alergias y preferencias alimentarias",
				detail:
					"Indica qué incluye y solicita la información alimentaria solo cuando sea necesaria.",
				hrefSection: "subtype",
			},
		],
	},
	{
		match: /famil|niñ|infant/,
		criteria: [
			{
				id: "age-bands",
				label: "Edades y participación",
				detail: "Define edades admitidas y cuándo un infante ocupa cupo.",
				hrefSection: "tickets",
			},
		],
	},
]

export function tourActivityQualityCriteria(
	categories: Array<{ slug?: string | null; name?: string | null }>
): TourActivityQualityCriterion[] {
	const haystack = categories
		.map((category) => `${category.slug ?? ""} ${category.name ?? ""}`.toLowerCase())
		.join(" ")
	const selected = [...BASE_CRITERIA]
	for (const rule of ACTIVITY_RULES) {
		if (rule.match.test(haystack)) selected.push(...rule.criteria)
	}
	return [...new Map(selected.map((criterion) => [criterion.id, criterion])).values()]
}
