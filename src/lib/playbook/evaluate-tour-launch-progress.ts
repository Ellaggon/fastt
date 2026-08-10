import { loadCompleteToPublishState } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import {
	getNextTourLaunchStep,
	TOUR_LAUNCH_STEPS,
	type TourLaunchContext,
	type TourLaunchStepId,
} from "@/lib/playbook/launch-tour"
import { getProductFullAggregate } from "@/modules/catalog/public"

export type TourLaunchProgressResult = {
	playbookId: "launch-tour"
	productId: string
	progress: {
		completedSteps: number
		totalSteps: number
		progressPercent: number
	}
	steps: Array<{
		key: TourLaunchStepId
		label: string
		guestImpact: string
		complete: boolean
		href: string
		isCurrent: boolean
		isNext: boolean
	}>
	currentStep: TourLaunchStepId | null
	nextStep: TourLaunchStepId | null
	nextHref: string | null
	exitHref: string
}

type TourProgressOptions = {
	variantId?: string | null
	ratePlanId?: string | null
	currentStepId?: TourLaunchStepId | string | null
	request?: Request
	url?: URL
}

export async function evaluateTourLaunchProgress(
	productId: string,
	providerId: string,
	options: TourProgressOptions = {}
): Promise<TourLaunchProgressResult | null> {
	const aggregate = await getProductFullAggregate(productId, providerId)
	if (!aggregate) return null

	const publishState = await loadCompleteToPublishState({
		productId,
		providerId,
		request: options.request,
		url: options.url,
	})
	if (!publishState) return null

	const completionBySection = new Map(
		publishState.checks.map((check) => [check.sectionKey, check.complete] as const)
	)
	const completion: Record<TourLaunchStepId, boolean> = {
		create: true,
		content: Boolean(completionBySection.get("content")),
		location: Boolean(completionBySection.get("location")),
		images: Boolean(completionBySection.get("photos")),
		subtype:
			Boolean(completionBySection.get("subtype")) && Boolean(completionBySection.get("itinerary")),
		tickets: Boolean(completionBySection.get("tickets")),
		departure: Boolean(completionBySection.get("departure")),
		rate: Boolean(completionBySection.get("rate")),
		conditions: Boolean(completionBySection.get("bookingPolicies")),
		calendar: Boolean(completionBySection.get("calendar")),
		preview: false,
	}

	const explicitCurrent = TOUR_LAUNCH_STEPS.find((step) => step.id === options.currentStepId)
	const currentStepId =
		explicitCurrent?.id ??
		TOUR_LAUNCH_STEPS.find((step) => !completion[step.id])?.id ??
		TOUR_LAUNCH_STEPS[0]?.id ??
		null
	const nextStep = currentStepId ? getNextTourLaunchStep(currentStepId) : null
	const ctx: TourLaunchContext = {
		productId,
		variantId: String(options.variantId ?? "").trim() || undefined,
		ratePlanId: String(options.ratePlanId ?? "").trim() || undefined,
	}
	const steps = TOUR_LAUNCH_STEPS.map((step) => ({
		key: step.id,
		label: step.label,
		guestImpact: step.guestImpact,
		complete: completion[step.id],
		href: step.buildHref(ctx),
		isCurrent: step.id === currentStepId,
		isNext: step.id === nextStep?.id,
	}))
	const completedSteps = steps.filter((step) => step.complete).length
	const totalSteps = steps.length

	return {
		playbookId: "launch-tour",
		productId,
		progress: {
			completedSteps,
			totalSteps,
			progressPercent: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
		},
		steps,
		currentStep: currentStepId,
		nextStep: nextStep?.id ?? null,
		nextHref: nextStep ? nextStep.buildHref(ctx) : null,
		exitHref: `/product/${encodeURIComponent(productId)}`,
	}
}
