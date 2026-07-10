import {
	getApplicableLaunchSteps,
	getLaunchStepById,
	getNextLaunchStep,
	getPreviousLaunchStep,
	type LaunchContext,
	type LaunchStepId,
} from "@/lib/playbook/launch-accommodation"
import { getProductVerticalEntry } from "@/lib/catalog/productVerticalRegistry"
import { getProductFullAggregate, getProductVariantsAggregate } from "@/modules/catalog/public"
import { buildGuestStayExpectationsSnapshot } from "@/modules/house-rules/public"
import { essentialHouseRuleTypes } from "@/modules/house-rules/presentation/houseRulePresentation"

export type LaunchProgressStep = {
	key: LaunchStepId
	label: string
	guestImpact: string
	complete: boolean
	href: string
	isCurrent: boolean
	isNext: boolean
}

export type LaunchProgressResult = {
	playbookId: "launch"
	productId: string
	vertical: string
	isHotel: boolean
	progress: {
		completedSteps: number
		totalSteps: number
		progressPercent: number
	}
	steps: LaunchProgressStep[]
	currentStep: LaunchStepId | null
	nextStep: LaunchStepId | null
	nextHref: string | null
	exitHref: string
}

type EvaluateLaunchProgressOptions = {
	isHotel?: boolean
	currentStepId?: LaunchStepId | string | null
}

async function stepCompletionFlags(productId: string, providerId: string, isHotel: boolean) {
	const [aggregate, variantsAggregate, guestExpectationsSnapshot] = await Promise.all([
		getProductFullAggregate(productId, providerId),
		isHotel ? getProductVariantsAggregate(productId, providerId) : Promise.resolve(null),
		isHotel ? buildGuestStayExpectationsSnapshot(productId) : Promise.resolve(null),
	])

	if (!aggregate) return null

	const variants = Array.isArray(variantsAggregate?.variants) ? variantsAggregate.variants : []
	const activeVariants = variants.filter((variant) => {
		const status = String(variant.status ?? "")
			.trim()
			.toLowerCase()
		return status !== "archived"
	})

	const houseRules = guestExpectationsSnapshot?.rules ?? []
	const houseRuleTypes = new Set(
		houseRules.map((rule: { type?: string }) => String(rule.type ?? ""))
	)
	const completedHouseRuleTypes = essentialHouseRuleTypes.filter((type) => houseRuleTypes.has(type))

	return {
		"create": true,
		"content": Boolean(aggregate.content.description?.trim()),
		"location": Boolean(aggregate.location.lat !== null && aggregate.location.lng !== null),
		"images": aggregate.images.length > 0,
		"subtype": Boolean(aggregate.subtype),
		"room-profile": isHotel && activeVariants.length > 0,
		"house-rules": isHotel && completedHouseRuleTypes.length >= 4,
		"preview": false,
	} satisfies Record<LaunchStepId, boolean>
}

export async function evaluateLaunchProgress(
	productId: string,
	providerId: string,
	options: EvaluateLaunchProgressOptions = {}
): Promise<LaunchProgressResult | null> {
	const aggregate = await getProductFullAggregate(productId, providerId)
	if (!aggregate) return null

	const vertical = getProductVerticalEntry(aggregate.productType)
	const isHotel = options.isHotel ?? vertical.vertical === "hotel"
	const ctx: LaunchContext = { productId, isHotel }
	const completion = await stepCompletionFlags(productId, providerId, isHotel)
	if (!completion) return null

	const applicableSteps = getApplicableLaunchSteps(ctx)
	const currentStepId =
		(options.currentStepId as LaunchStepId | null) ??
		applicableSteps.find((step) => !completion[step.id])?.id ??
		applicableSteps[0]?.id ??
		null
	const nextStep = currentStepId
		? getNextLaunchStep(currentStepId, ctx)
		: (applicableSteps[0] ?? null)

	const steps: LaunchProgressStep[] = applicableSteps.map((step) => ({
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
		playbookId: "launch",
		productId,
		vertical: vertical.vertical,
		isHotel,
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

export function getLaunchStepMeta(
	stepId: LaunchStepId | string | null | undefined,
	ctx: LaunchContext
) {
	const step = getLaunchStepById(stepId, ctx)
	const applicableSteps = getApplicableLaunchSteps(ctx)
	const index = step ? applicableSteps.findIndex((item) => item.id === step.id) : -1

	return {
		step,
		stepNumber: index >= 0 ? index + 1 : null,
		totalSteps: applicableSteps.length,
		previousStep: stepId ? getPreviousLaunchStep(stepId, ctx) : null,
	}
}
