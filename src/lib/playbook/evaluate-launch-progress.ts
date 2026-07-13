import {
	getApplicableLaunchSteps,
	getLaunchStepById,
	getNextLaunchStep,
	getPreviousLaunchStep,
	type LaunchContext,
	type LaunchStepId,
} from "@/lib/playbook/launch-accommodation"
import {
	loadVariantCompletion,
	type VariantCompletion,
} from "@/lib/playbook/evaluate-add-room-progress"
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
	variantId: string | null
	ratePlanId: string | null
}

type EvaluateLaunchProgressOptions = {
	isHotel?: boolean
	variantId?: string | null
	ratePlanId?: string | null
	currentStepId?: LaunchStepId | string | null
}

async function resolveLaunchVariantState(
	productId: string,
	providerId: string,
	variantIds: string[],
	preferredVariantId?: string | null
): Promise<{ variantId: string | null; completion: VariantCompletion | null }> {
	const preferred = String(preferredVariantId ?? "").trim()
	const orderedVariantIds = [
		...(preferred && variantIds.includes(preferred) ? [preferred] : []),
		...variantIds.filter((variantId) => variantId !== preferred),
	]

	for (const variantId of orderedVariantIds) {
		const completion = await loadVariantCompletion(productId, providerId, variantId)
		if (completion?.isComplete) return { variantId, completion }
		if (completion?.tariffsComplete && completion.pricingComplete) return { variantId, completion }
		if (completion?.tariffsComplete) return { variantId, completion }
		if (completion?.capacityComplete) return { variantId, completion }
	}

	if (!orderedVariantIds.length) return { variantId: null, completion: null }
	const firstVariantId = orderedVariantIds[0]
	return {
		variantId: firstVariantId ?? null,
		completion: firstVariantId
			? await loadVariantCompletion(productId, providerId, firstVariantId)
			: null,
	}
}

async function stepCompletionFlags(
	productId: string,
	providerId: string,
	isHotel: boolean,
	options: Pick<EvaluateLaunchProgressOptions, "variantId" | "ratePlanId"> = {}
) {
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
	const activeVariantIds = activeVariants.map((variant) => String(variant.id)).filter(Boolean)
	const variantState = isHotel
		? await resolveLaunchVariantState(productId, providerId, activeVariantIds, options.variantId)
		: { variantId: null, completion: null }
	const commercialCompletion = variantState.completion
	const ratePlanId =
		String(options.ratePlanId ?? "").trim() ||
		String(commercialCompletion?.defaultRatePlanId ?? "").trim() ||
		null

	const houseRules = guestExpectationsSnapshot?.rules ?? []
	const houseRuleTypes = new Set(
		houseRules.map((rule: { type?: string }) => String(rule.type ?? ""))
	)
	const completedHouseRuleTypes = essentialHouseRuleTypes.filter((type) => houseRuleTypes.has(type))

	return {
		completion: {
			"create": true,
			"content": Boolean(aggregate.content.description?.trim()),
			"location": Boolean(aggregate.location.lat !== null && aggregate.location.lng !== null),
			"images": aggregate.images.length > 0,
			"subtype": Boolean(aggregate.subtype),
			"room-profile": isHotel && activeVariants.length > 0,
			"rate": Boolean(commercialCompletion?.tariffsComplete),
			"conditions": Boolean(commercialCompletion?.conditionsComplete),
			"calendar": Boolean(commercialCompletion?.inventoryComplete),
			"house-rules": isHotel && completedHouseRuleTypes.length >= 4,
			"preview": false,
		} satisfies Record<LaunchStepId, boolean>,
		variantId: variantState.variantId,
		ratePlanId,
	}
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
	const state = await stepCompletionFlags(productId, providerId, isHotel, {
		variantId: options.variantId,
		ratePlanId: options.ratePlanId,
	})
	if (!state) return null
	const completion = state.completion
	const ctx: LaunchContext = {
		productId,
		isHotel,
		variantId: state.variantId ?? undefined,
		ratePlanId: state.ratePlanId ?? undefined,
	}

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
		variantId: state.variantId,
		ratePlanId: state.ratePlanId,
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
