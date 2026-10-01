import {
	summarizeTourDiagnostic,
	type TourDiagnostic,
	type TourRequirementId,
} from "@/lib/tours/tourDiagnosticContract"

/** Navigation groups are not units of preparation or authorization. */
export const TOUR_PUBLISHING_STAGES = [
	{
		id: "presentation",
		label: "Presenta tu experiencia",
		steps: ["create", "content", "location", "categories"],
		requirements: ["presentation", "activities"],
	},
	{
		id: "logistics",
		label: "Recorrido y logística",
		steps: ["subtype", "itinerary", "services", "inclusions"],
		requirements: ["logistics"],
	},
	{ id: "photos", label: "Fotos", steps: ["photos", "images"], requirements: ["photos"] },
	{
		id: "offer",
		label: "Opción, precio y condiciones",
		steps: ["tickets", "departure", "rate", "bookingPolicies", "conditions"],
		requirements: ["participants", "option_profile", "group_capacity", "price", "conditions"],
	},
	{
		id: "calendar",
		label: "Fechas y cupos",
		steps: ["calendar"],
		requirements: ["calendar_configuration"],
	},
	{ id: "review", label: "Revisar y publicar", steps: ["preview"], requirements: [] },
] as const satisfies readonly {
	id: string
	label: string
	steps: readonly string[]
	requirements: readonly TourRequirementId[]
}[]

export const TOUR_PUBLISHING_STAGE_COUNT = TOUR_PUBLISHING_STAGES.length
export type TourPublishingStage = { id: string; label: string; position: number; total: number }

export function getTourPublishingStage(stepId: string | null | undefined): TourPublishingStage {
	const index = TOUR_PUBLISHING_STAGES.findIndex((stage) =>
		(stage.steps as readonly string[]).includes(String(stepId ?? "").trim())
	)
	const position = index < 0 ? TOUR_PUBLISHING_STAGE_COUNT : index + 1
	const stage = TOUR_PUBLISHING_STAGES[position - 1]
	return { id: stage.id, label: stage.label, position, total: TOUR_PUBLISHING_STAGE_COUNT }
}

/** The last stage is a server decision, never an extra preparation requirement. */
export function projectTourPublishingStages(diagnosis: TourDiagnostic) {
	const summary = summarizeTourDiagnostic(diagnosis)
	return TOUR_PUBLISHING_STAGES.map((stage, index) => {
		const states = stage.requirements.map((id) => diagnosis.requirements[id].result.state)
		const state =
			stage.id === "review"
				? summary.preparation.complete &&
					summary.authorization.complete &&
					summary.activation.complete
					? "ready"
					: "pending"
				: states.includes("not_evaluable")
					? "not_evaluable"
					: states.includes("blocked")
						? "blocked"
						: states.every((state) => state === "ready")
							? "ready"
							: "pending"
		const firstPending = stage.requirements.find(
			(id) => diagnosis.requirements[id].result.state !== "ready"
		)
		const result = firstPending ? diagnosis.requirements[firstPending].result : null
		return {
			id: stage.id,
			label: stage.label,
			position: index + 1,
			total: TOUR_PUBLISHING_STAGE_COUNT,
			state,
			href: result && "action" in result ? result.action.href : null,
		}
	})
}
