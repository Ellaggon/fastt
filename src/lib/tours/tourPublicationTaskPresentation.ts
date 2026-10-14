import type { TourRequirementId } from "./tourDiagnosticContract"
import type { projectTourPublicationTasks } from "./tourPublicationTasks"
import type { ReadinessStatusVariant } from "@/lib/ui/readinessPresentation"

type PublicationTask = ReturnType<typeof projectTourPublicationTasks>["tasks"][number]
type WaitingTask = ReturnType<typeof projectTourPublicationTasks>["waiting"][number]
type ChecklistTask = PublicationTask | WaitingTask

const PREPARATION_IMPACT = "Bloquea publicación y reservas"
const AUTHORIZATION_IMPACT = "Bloquea publicación, reservas, cobros, integraciones"

function primaryRequirementId(task: ChecklistTask): TourRequirementId | undefined {
	return task.ids[0]
}

export function tourPublicationTaskStatus(task: ChecklistTask): {
	label: string
	variant: ReadinessStatusVariant
} {
	if (/in_review|under_review/.test(task.code)) {
		return { label: "En revisión", variant: "info" }
	}
	if (task.responsible === "fastt") {
		return { label: "En revisión", variant: "info" }
	}
	if ("unknown" in task && task.unknown) {
		return { label: "Acción necesaria", variant: "error" }
	}
	return { label: "Pendiente", variant: "warning" }
}

export function tourPublicationTaskImpact(task: ChecklistTask): string {
	const id = primaryRequirementId(task)
	if (id === "provider_authorization" || id === "experience_authorization") {
		return AUTHORIZATION_IMPACT
	}
	if (id && id !== "option_profile" && id !== "group_capacity") {
		const axisHint = task.messages.find((message) => /bloquea/i.test(message))
		if (axisHint) return axisHint
	}
	return task.messages[0] ?? PREPARATION_IMPACT
}

export function tourPublicationTaskHeadline(task: ChecklistTask): string {
	const id = primaryRequirementId(task)
	if (id === "provider_authorization" && /in_review|under_review/.test(task.code)) {
		return "Cuenta en revisión"
	}
	return task.label
}

export const tourPublicationTaskIconId = (task: ChecklistTask) => {
	const id = primaryRequirementId(task)
	if (!id) return "presentation"
	if (id === "activities") return "presentation"
	if (id === "option_profile" || id === "group_capacity") return "option"
	if (id === "provider_authorization" || id === "experience_authorization") return "authorization"
	return id
}
