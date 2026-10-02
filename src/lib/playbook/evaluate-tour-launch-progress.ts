import { presentTourDiagnostic } from "@/lib/tours/tourDiagnosticPresentation"
import { TOUR_REQUIREMENTS } from "@/lib/tours/tourDiagnosticContract"
import { loadCompleteToPublishState } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import {
	getNextTourLaunchStep,
	TOUR_LAUNCH_STEPS,
	type TourLaunchContext,
	type TourLaunchStepId,
} from "@/lib/playbook/launch-tour"

export type TourLaunchProgressResult = {
	playbookId: "launch-tour"
	tourPresentation?: ReturnType<typeof presentTourDiagnostic>
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
	const publishState = await loadCompleteToPublishState({
		productId,
		providerId,
		request: options.request,
		url: options.url,
		selection:
			options.variantId || options.ratePlanId
				? { variantId: options.variantId, ratePlanId: options.ratePlanId }
				: undefined,
	})
	if (!publishState) return null

	const completionBySection = new Map<string, boolean>()
	for (const check of publishState.checks) {
		if (
			publishState.tourDiagnostic &&
			!(
				check.key in TOUR_REQUIREMENTS &&
				TOUR_REQUIREMENTS[check.key as keyof typeof TOUR_REQUIREMENTS].axis === "preparation"
			)
		)
			continue
		completionBySection.set(
			check.sectionKey,
			(completionBySection.get(check.sectionKey) ?? true) && check.complete
		)
	}

	const completion: Record<TourLaunchStepId, boolean> = {
		create: true,
		content: Boolean(completionBySection.get("content")),
		location: Boolean(
			completionBySection.get(publishState.tourDiagnostic ? "subtype" : "location")
		),
		images: Boolean(completionBySection.get("photos")),
		subtype:
			Boolean(completionBySection.get("subtype")) &&
			(Boolean(publishState.tourDiagnostic) || Boolean(completionBySection.get("itinerary"))),
		tickets: Boolean(completionBySection.get("tickets")),
		categories: Boolean(completionBySection.get("categories")),
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
		variantId:
			publishState.tourContext && "variantId" in publishState.tourContext
				? (publishState.tourContext.variantId ?? undefined)
				: undefined,
		ratePlanId:
			publishState.tourContext && "ratePlanId" in publishState.tourContext
				? (publishState.tourContext.ratePlanId ?? undefined)
				: undefined,
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
	const completedSteps = publishState.completedChecks
	const totalSteps = publishState.totalChecks

	return {
		playbookId: "launch-tour",
		tourPresentation: publishState.tourDiagnostic
			? presentTourDiagnostic(publishState.tourDiagnostic, {
					published: publishState.editorialStatus === "published",
					previewHref: publishState.checks.find((check) => check.key === "preview")!.href,
				})
			: undefined,
		productId,
		progress: {
			completedSteps,
			totalSteps,
			progressPercent: publishState.readinessPercent,
		},
		steps,
		currentStep: currentStepId,
		nextStep: nextStep?.id ?? null,
		nextHref: nextStep ? nextStep.buildHref(ctx) : null,
		exitHref: `/product/${encodeURIComponent(productId)}`,
	}
}
