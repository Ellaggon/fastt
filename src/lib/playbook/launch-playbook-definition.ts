import {
	getApplicableLaunchSteps,
	LAUNCH_PLAYBOOK_TITLE,
	type LaunchContext,
	type LaunchStepId,
} from "@/lib/playbook/launch-accommodation"
import {
	LAUNCH_TOUR_PLAYBOOK_TITLE,
	TOUR_LAUNCH_STEPS,
	type TourLaunchContext,
	type TourLaunchStepId,
} from "@/lib/playbook/launch-tour"
import { getTourPublishingStage } from "@/lib/playbook/tour-publishing-stages"

export type LaunchLikePlaybookId = "launch" | "launch-tour"
export type LaunchLikeStepId = LaunchStepId | TourLaunchStepId
export type LaunchLikeContext = LaunchContext & TourLaunchContext

export type LaunchLikeStep = {
	id: LaunchLikeStepId
	label: string
	guestImpact: string
	buildHref: (context: LaunchLikeContext) => string
}

export type LaunchLikeStage = { label: string; position: number; total: number }

export type LaunchPlaybookDefinition = {
	id: LaunchLikePlaybookId
	title: string
	steps: LaunchLikeStep[]
}

export function resolveLaunchPlaybookDefinition(
	playbookId: LaunchLikePlaybookId,
	context: LaunchLikeContext
): LaunchPlaybookDefinition {
	if (playbookId === "launch-tour") {
		return {
			id: playbookId,
			title: LAUNCH_TOUR_PLAYBOOK_TITLE,
			steps: TOUR_LAUNCH_STEPS.map((step) => ({
				...step,
				buildHref: (ctx) => step.buildHref(ctx),
			})),
		}
	}
	return {
		id: playbookId,
		title: LAUNCH_PLAYBOOK_TITLE,
		steps: getApplicableLaunchSteps(context).map((step) => ({
			...step,
			buildHref: (ctx) => step.buildHref(ctx),
		})),
	}
}

export function getLaunchLikeStepPosition(
	definition: LaunchPlaybookDefinition,
	stepId: LaunchLikeStepId | string | null | undefined
) {
	const index = definition.steps.findIndex((step) => step.id === stepId)
	return {
		current: index >= 0 ? (definition.steps[index] ?? null) : null,
		previous: index > 0 ? (definition.steps[index - 1] ?? null) : null,
		next:
			index >= 0 && index < definition.steps.length - 1
				? (definition.steps[index + 1] ?? null)
				: null,
		stepNumber: index >= 0 ? index + 1 : null,
		totalSteps: definition.steps.length,
	}
}

export function getLaunchLikeStage(
	definition: LaunchPlaybookDefinition,
	stepId: LaunchLikeStepId | string
): LaunchLikeStage {
	if (definition.id === "launch-tour") {
		const stage = getTourPublishingStage(String(stepId))
		const index = definition.steps.findIndex((step) => step.id === stepId)
		const position = index >= 0 ? index + 1 : stage.position
		return { label: stage.label, position, total: definition.steps.length }
	}
	const index = definition.steps.findIndex((step) => step.id === stepId)
	if (index >= definition.steps.length - 1) {
		return { label: "Revisión y publicación", position: 3, total: 3 }
	}
	if (index < 5) {
		return {
			label: "Tu alojamiento",
			position: 1,
			total: 3,
		}
	}
	return {
		label: "Habitaciones y venta",
		position: 2,
		total: 3,
	}
}
