import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"
import { completeToPublishStepHref } from "@/lib/playbook/complete-to-publish"
import { type TourDiagnostic } from "@/lib/tours/tourDiagnosticContract"
import { tourDiagnosticSelectionContext } from "@/lib/tours/tourPreparationRequirements"
import { tourConditionsHref } from "@/lib/tours/tourConditionsHref"

import {
	TOUR_PREPARATION_STAGES,
	normalizeTourLaunchStep,
	buildTourPlaybookHref,
} from "./launch-tour"

export const TOUR_PUBLISHING_STAGES = TOUR_PREPARATION_STAGES

export const TOUR_PUBLISHING_STAGE_COUNT = TOUR_PUBLISHING_STAGES.length
export type TourPublishingStage = { id: string; label: string; position: number; total: number }

const STAGE_CANONICAL_SECTION = {
	presentation: "content",
	logistics: "subtype",
	location: "location",
	photos: "photos",
	participants: "tickets",
	option: "departure",
	price: "rate",
	conditions: "bookingPolicies",
	calendar: "calendar",
} as const satisfies Record<
	(typeof TOUR_PUBLISHING_STAGES)[number]["id"],
	ProductVerticalSectionKey
>

export function tourPublishingStageHref(
	diagnosis: TourDiagnostic,
	stageId: (typeof TOUR_PUBLISHING_STAGES)[number]["id"]
): string {
	const productId = diagnosis.context.productId
	const context = tourDiagnosticSelectionContext(diagnosis)

	return buildTourPlaybookHref(
		stageId === "conditions"
			? tourConditionsHref(productId, context)
			: completeToPublishStepHref(productId, STAGE_CANONICAL_SECTION[stageId], context),
		normalizeTourLaunchStep(STAGE_CANONICAL_SECTION[stageId])!
	)
}

export function getTourPublishingStage(stepId: string | null | undefined): TourPublishingStage {
	const normalized = normalizeTourLaunchStep(stepId)
	if (normalized === "preview")
		return {
			id: "review",
			label: "Revisar y publicar",
			position: 0,
			total: TOUR_PUBLISHING_STAGE_COUNT,
		}
	const index = TOUR_PUBLISHING_STAGES.findIndex((stage) =>
		(stage.steps as readonly string[]).includes(normalized ?? "")
	)
	const stage = TOUR_PUBLISHING_STAGES[index < 0 ? 0 : index]
	return {
		id: stage.id,
		label: stage.label,
		position: index < 0 ? 1 : index + 1,
		total: TOUR_PUBLISHING_STAGE_COUNT,
	}
}

/** Preparation state is independent of authorization, activation and review. */
export function projectTourPublishingStages(diagnosis: TourDiagnostic) {
	return TOUR_PUBLISHING_STAGES.map((stage, index) => {
		const states = stage.requirements.map((id) => {
			const result = diagnosis.requirements[id].result
			return result.state === "not_evaluable" &&
				"reason" in result &&
				["missing_option", "missing_rate", "selection_required", "invalid_selection"].includes(
					result.reason.code
				)
				? "pending"
				: result.state
		})
		const state = states.includes("not_evaluable")
			? "not_evaluable"
			: states.includes("blocked")
				? "blocked"
				: states.every((state) => state === "ready" || state === "not_applicable")
					? "ready"
					: "pending"
		const firstPending = stage.requirements.find(
			(id) =>
				!(["ready", "not_applicable"] as readonly string[]).includes(
					diagnosis.requirements[id].result.state
				)
		)
		const result = firstPending ? diagnosis.requirements[firstPending].result : null

		return {
			id: stage.id,
			label: stage.label,
			position: index + 1,
			total: TOUR_PUBLISHING_STAGE_COUNT,
			state,
			pendingReason: result && "reason" in result ? result.reason.message : null,
			href: tourPublishingStageHref(diagnosis, stage.id),
		}
	})
}
