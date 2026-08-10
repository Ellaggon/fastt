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

export type LaunchLikePlaybookId = "launch" | "launch-tour"
export type LaunchLikeStepId = LaunchStepId | TourLaunchStepId
export type LaunchLikeContext = LaunchContext & TourLaunchContext

export type LaunchLikeStep = {
	id: LaunchLikeStepId
	label: string
	guestImpact: string
	buildHref: (context: LaunchLikeContext) => string
}

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
