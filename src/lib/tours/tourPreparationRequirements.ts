import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"
import { completeToPublishStepHref } from "@/lib/playbook/complete-to-publish"
import {
	TOUR_REQUIREMENTS,
	type TourDiagnostic,
	type TourRequirementId,
} from "./tourDiagnosticContract"
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

export const TOUR_PREPARATION_REQUIREMENT_ORDER = [
	"presentation",
	"logistics",
	"photos",
	"participants",
	"activities",
	"option_profile",
	"group_capacity",
	"price",
	"conditions",
	"calendar_configuration",
] as const satisfies readonly TourRequirementId[]

export type TourPreparationRequirementView = {
	id: TourRequirementId
	position: number
	label: string
	state: TourDiagnostic["requirements"][TourRequirementId]["result"]["state"]
	href: string | null
}

export function resolveActiveTourPreparationRequirement(
	stepId: string | null | undefined,
	nextRequirementId: TourRequirementId | null | undefined,
	options: { preferPlaybookStep?: boolean } = {}
): TourRequirementId | null {
	const preferPlaybookStep = options.preferPlaybookStep ?? true
	const step = String(stepId ?? "").trim()
	const byStep: Record<string, TourRequirementId> = {
		content: "presentation",
		location: "logistics",
		images: "photos",
		photos: "photos",
		subtype: "logistics",
		tickets: "participants",
		categories: "activities",
		departure: "option_profile",
		rate: "price",
		conditions: "conditions",
		bookingPolicies: "conditions",
		calendar: "calendar_configuration",
	}
	const fromStep = byStep[step] ?? null
	if (preferPlaybookStep && fromStep) return fromStep
	if (nextRequirementId && TOUR_REQUIREMENTS[nextRequirementId]?.axis === "preparation") {
		return nextRequirementId
	}
	return fromStep
}

export function projectTourPreparationRequirements(
	diagnosis: TourDiagnostic
): TourPreparationRequirementView[] {
	return TOUR_PREPARATION_REQUIREMENT_ORDER.map((id, index) => {
		const result = diagnosis.requirements[id].result
		const href = tourPreparationRequirementHref(diagnosis, id)
		return {
			id,
			position: index + 1,
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
	return `Requisitos ${preparation.readyCount} de ${preparation.totalCount} · Preparado ${preparation.readinessPercent}%`
}

export function requirementStatusLabel(
	requirement: TourPreparationRequirementView,
	activeRequirementId: TourRequirementId | null
): string {
	if (requirement.id === activeRequirementId && requirement.state !== "ready") {
		return "En curso"
	}
	if (requirement.state === "ready") return "Lista"
	if (requirement.state === "blocked") return "Requiere revisión"
	if (requirement.state === "not_evaluable") return "Sin evaluar"
	if (requirement.state === "not_applicable") return "No aplica"
	return "Pendiente"
}
