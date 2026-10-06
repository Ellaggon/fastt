import {
	TOUR_REQUIREMENTS,
	type TourDiagnostic,
	type TourRequirementId,
} from "./tourDiagnosticContract"
import { TOUR_REQUIREMENT_PRESENTATION } from "./tourDiagnosticPresentation"
import {
	tourPreparationRequirementHref,
	tourDiagnosticSelectionContext,
} from "./tourPreparationRequirements"
import { tourPublicationCorrectionHref } from "@/lib/playbook/tour-playbook-context"

export function projectTourPublicationTasks(diagnosis: TourDiagnostic) {
	const tasks = new Map<
		string,
		{
			key: string
			ids: TourRequirementId[]
			label: string
			messages: string[]
			href: string | null
			responsible: "provider" | "fastt"
			unknown: boolean
			code: string
		}
	>()
	const completed: { id: TourRequirementId; label: string; href: string }[] = []
	const selection = tourDiagnosticSelectionContext(diagnosis)
	for (const id of Object.keys(TOUR_REQUIREMENTS) as TourRequirementId[]) {
		const definition = TOUR_REQUIREMENTS[id]
		if (definition.axis !== "preparation" && definition.axis !== "authorization") continue
		const result = diagnosis.requirements[id].result
		const label = TOUR_REQUIREMENT_PRESENTATION[id].label
		const isDependency =
			"reason" in result &&
			["missing_option", "missing_rate", "selection_required", "invalid_selection"].includes(
				result.reason.code
			)
		const unknown = result.state === "not_evaluable" && !isDependency
		const href = tourPublicationCorrectionHref(
			tourPreparationRequirementHref(diagnosis, id),
			diagnosis.context.productId,
			selection
		)
		if (result.state === "ready" || result.state === "not_applicable") {
			if (definition.axis === "preparation") completed.push({ id, label, href })
			continue
		}
		const target = new URL(href, "http://fastt.local")
		const key = `${result.responsible}:${target.pathname}:${target.searchParams.get("vista") ?? ""}`
		const existing = tasks.get(key)
		if (existing) {
			existing.ids.push(id)
			if (unknown) {
				existing.unknown = true
				existing.href = null
			}
			if (!existing.messages.includes(result.reason.message))
				existing.messages.push(result.reason.message)
			continue
		}
		tasks.set(key, {
			key,
			ids: [id],
			label: id === "option_profile" || id === "group_capacity" ? "Completar opción" : label,
			messages: [result.reason.message],
			href: unknown || result.responsible === "fastt" ? null : href,
			responsible: result.responsible,
			unknown,
			code: result.reason.code,
		})
	}
	return {
		tasks: [...tasks.values()].filter((task) => task.responsible === "provider"),
		waiting: [...tasks.values()].filter((task) => task.responsible === "fastt"),
		completed,
	}
}
