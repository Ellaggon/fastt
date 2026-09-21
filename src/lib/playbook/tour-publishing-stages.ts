export type TourPublishingStage = {
	id: "identity" | "destination" | "experience" | "audience" | "commercial" | "review"
	label: string
	position: number
	total: 6
}

const STAGES: TourPublishingStage[] = [
	{ id: "identity", label: "Identidad", position: 1, total: 6 },
	{ id: "destination", label: "Destino", position: 2, total: 6 },
	{ id: "experience", label: "Experiencia", position: 3, total: 6 },
	{ id: "audience", label: "Participantes y búsqueda", position: 4, total: 6 },
	{ id: "commercial", label: "Salidas y venta", position: 5, total: 6 },
	{ id: "review", label: "Revisión y publicación", position: 6, total: 6 },
]

function byId(id: TourPublishingStage["id"]): TourPublishingStage {
	return STAGES.find((stage) => stage.id === id) ?? STAGES[0]
}

export function getTourPublishingStage(stepId: string | null | undefined): TourPublishingStage {
	const step = String(stepId ?? "").trim()
	if (["create", "content"].includes(step)) return byId("identity")
	if (step === "location") return byId("destination")
	if (["images", "photos", "subtype", "itinerary", "services"].includes(step)) {
		return byId("experience")
	}
	if (["tickets", "categories"].includes(step)) return byId("audience")
	if (["departure", "rate", "conditions", "bookingPolicies", "calendar"].includes(step)) {
		return byId("commercial")
	}
	return byId("review")
}

export const TOUR_PUBLISHING_STAGE_COUNT = STAGES.length
