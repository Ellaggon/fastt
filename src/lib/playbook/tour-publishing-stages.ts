export type TourPublishingStage = {
	id: string
	label: string
	position: number
	total: number
}

const SCREENS: Array<{ id: string; label: string; steps: string[] }> = [
	{ id: "identity", label: "Identidad", steps: ["content"] },
	{ id: "photos", label: "Fotos", steps: ["photos", "images"] },
	{ id: "destination", label: "Destino", steps: ["location"] },
	{ id: "itinerary", label: "Itinerario y detalles", steps: ["subtype", "itinerary"] },
	{ id: "participants", label: "Participantes", steps: ["tickets"] },
	{ id: "categories", label: "Participantes y búsqueda", steps: ["categories"] },
	{ id: "departure", label: "Salida", steps: ["departure"] },
	{ id: "rate", label: "Precio", steps: ["rate"] },
	{
		id: "booking",
		label: "Condiciones de reserva",
		steps: ["bookingPolicies", "conditions"],
	},
	{ id: "availability", label: "Disponibilidad", steps: ["calendar"] },
	{ id: "review", label: "Revisión y publicación", steps: ["preview"] },
]

const TOTAL = SCREENS.length

const BY_STEP = new Map<string, TourPublishingStage>()
SCREENS.forEach((screen, index) => {
	const stage: TourPublishingStage = {
		id: screen.id,
		label: screen.label,
		position: index + 1,
		total: TOTAL,
	}
	for (const step of screen.steps) BY_STEP.set(step, stage)
})

const EXTRA_LABELS: Record<string, { id: string; label: string; near: string }> = {
	create: { id: "create", label: "Crear tour", near: "content" },
	services: { id: "services", label: "Servicios", near: "subtype" },
	inclusions: { id: "inclusions", label: "Incluye y no incluye", near: "preview" },
	houseRules: { id: "houseRules", label: "Reglas para huéspedes", near: "preview" },
}

export function getTourPublishingStage(stepId: string | null | undefined): TourPublishingStage {
	const step = String(stepId ?? "").trim()
	const known = BY_STEP.get(step)
	if (known) return known
	const extra = EXTRA_LABELS[step]
	const anchor = BY_STEP.get(extra?.near ?? "preview") ??
		BY_STEP.get("preview") ?? {
			id: "review",
			label: "Revisión y publicación",
			position: TOTAL,
			total: TOTAL,
		}
	if (!extra) return anchor
	return { ...anchor, id: extra.id, label: extra.label }
}

export const TOUR_PUBLISHING_STAGE_COUNT = TOTAL
