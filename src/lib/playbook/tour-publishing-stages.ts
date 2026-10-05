import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"
import { completeToPublishStepHref } from "@/lib/playbook/complete-to-publish"
import {
	summarizeTourDiagnostic,
	type TourDiagnostic,
	type TourRequirementId,
} from "@/lib/tours/tourDiagnosticContract"
import { tourDiagnosticSelectionContext } from "@/lib/tours/tourPreparationRequirements"

/** Navigation groups are not units of preparation or authorization. */
export const TOUR_PUBLISHING_STAGES = [
	{
		id: "presentation",
		label: "Presenta tu experiencia",
		steps: ["create", "content", "categories"],
		requirements: ["presentation", "activities"],
	},
	{
		id: "logistics",
		label: "Recorrido y logística",
		steps: ["location", "subtype", "itinerary", "services", "inclusions"],
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

const STAGE_CANONICAL_SECTION = {
	presentation: "content",
	logistics: "subtype",
	photos: "photos",
	offer: "tickets",
	calendar: "calendar",
	review: "preview",
} as const satisfies Record<
	(typeof TOUR_PUBLISHING_STAGES)[number]["id"],
	ProductVerticalSectionKey
>

export function tourPublishingStageHref(
	diagnosis: TourDiagnostic,
	stageId: (typeof TOUR_PUBLISHING_STAGES)[number]["id"],
	options: { previewHref?: string } = {}
): string {
	const productId = diagnosis.context.productId
	const context = tourDiagnosticSelectionContext(diagnosis)
	if (stageId === "review") {
		return options.previewHref ?? completeToPublishStepHref(productId, "preview", context)
	}
	return completeToPublishStepHref(productId, STAGE_CANONICAL_SECTION[stageId], context)
}

export function getTourPublishingStage(stepId: string | null | undefined): TourPublishingStage {
	const index = TOUR_PUBLISHING_STAGES.findIndex((stage) =>
		(stage.steps as readonly string[]).includes(String(stepId ?? "").trim())
	)
	const position = index < 0 ? TOUR_PUBLISHING_STAGE_COUNT : index + 1
	const stage = TOUR_PUBLISHING_STAGES[position - 1]
	return { id: stage.id, label: stage.label, position, total: TOUR_PUBLISHING_STAGE_COUNT }
}

/** The last stage is a server decision, never an extra preparation requirement. */
export function projectTourPublishingStages(
	diagnosis: TourDiagnostic,
	options: { previewHref?: string } = {}
) {
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
		const pendingHref = result && "action" in result ? result.action.href : null
		return {
			id: stage.id,
			label: stage.label,
			position: index + 1,
			total: TOUR_PUBLISHING_STAGE_COUNT,
			state,
			href: pendingHref ?? tourPublishingStageHref(diagnosis, stage.id, options),
		}
	})
}
