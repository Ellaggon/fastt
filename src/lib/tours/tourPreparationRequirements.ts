import { TOUR_PREPARATION_STAGES } from "@/lib/playbook/launch-tour"
import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"
import { completeToPublishStepHref } from "@/lib/playbook/complete-to-publish"
import { type TourDiagnostic, type TourRequirementId } from "./tourDiagnosticContract"
import { TOUR_REQUIREMENT_PRESENTATION } from "./tourDiagnosticPresentation"

export function tourDiagnosticSelectionContext(diagnosis: TourDiagnostic) {
	const selection = diagnosis.context.selection
	return selection.state === "resolved"
		? { variantId: selection.variantId, ratePlanId: selection.ratePlanId }
		: {}
}

export function tourPreparationRequirementHref(
	diagnosis: TourDiagnostic,
	requirementId: TourRequirementId
): string {
	const result = diagnosis.requirements[requirementId].result
	if ("action" in result) return result.action.href
	return completeToPublishStepHref(
		diagnosis.context.productId,
		TOUR_REQUIREMENT_PRESENTATION[requirementId].section as ProductVerticalSectionKey,
		tourDiagnosticSelectionContext(diagnosis)
	)
}

export const TOUR_PREPARATION_REQUIREMENT_ORDER = TOUR_PREPARATION_STAGES.flatMap((stage) => [
	...stage.requirements,
])

export type TourPreparationRequirementView = {
	id: TourRequirementId
	label: string
	state: TourDiagnostic["requirements"][TourRequirementId]["result"]["state"]
	href: string | null
}

export function projectTourPreparationRequirements(
	diagnosis: TourDiagnostic
): TourPreparationRequirementView[] {
	return TOUR_PREPARATION_REQUIREMENT_ORDER.map((id) => {
		const result = diagnosis.requirements[id].result
		const href = tourPreparationRequirementHref(diagnosis, id)
		return {
			id,
			label: TOUR_REQUIREMENT_PRESENTATION[id].label,
			state: result.state,
			href,
		}
	})
}

export function formatTourPreparationProgressLine(preparation: {
	readyCount: number
	totalCount: number
	readinessPercent: number
}): string {
	return `${preparation.readyCount} de ${preparation.totalCount} comprobaciones cumplidas`
}

export function requirementStatusLabel(requirement: TourPreparationRequirementView): string {
	if (requirement.state === "ready") return "Completo"
	if (requirement.state === "blocked") return "Requiere revisión"
	if (requirement.state === "not_evaluable") return "No se pudo comprobar"
	if (requirement.state === "not_applicable") return "No aplica"
	return "Pendiente"
}

/** Choose the actual missing form in a stage that spans location and tour details. */
export function projectTourLogisticsObservation(
	checks: { sectionKey: "subtype" | "itinerary" | "location"; complete: boolean; detail: string }[],
	productId: string,
	selection: { variantId?: string | null; ratePlanId?: string | null } = {}
) {
	const pending = checks.find((check) => !check.complete)
	return {
		ready: !pending,
		message: pending?.detail ?? "Recorrido y logística completos.",
		...(pending
			? {
					action: {
						label: pending.sectionKey === "location" ? "Definir ubicación" : "Completar logística",
						href: completeToPublishStepHref(productId, pending.sectionKey, selection),
					},
				}
			: {}),
	}
}
