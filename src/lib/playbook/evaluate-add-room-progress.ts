import {
	and,
	asc,
	DailyInventory,
	eq,
	Image,
	VariantImage,
	VariantInventoryConfig,
	VariantRoomBed,
	VariantRoomProfile,
	RatePlan,
	db,
	gt,
} from "@/shared/infrastructure/db/compat"
import { baseRateRepository } from "@/container"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"
import { getProductVariantsAggregate } from "@/modules/catalog/public"
import { REQUIRED_POLICY_CATEGORIES, resolveEffectivePolicies } from "@/modules/policies/public"
import {
	type AddRoomContext,
	type AddRoomStepId,
	getAddRoomJourneySteps,
	getAddRoomStepById,
	getAddRoomStepPosition,
	getNextAddRoomStep,
	isAddRoomStepLinkable,
} from "@/lib/playbook/add-room"

export type AddRoomProgressStep = {
	key: AddRoomStepId
	label: string
	guestImpact: string
	complete: boolean
	href: string
	isCurrent: boolean
	isNext: boolean
}

export type AddRoomProgressResult = {
	playbookId: "add-room"
	productId: string
	variantId: string | null
	ratePlanId: string | null
	progress: {
		completedSteps: number
		totalSteps: number
		progressPercent: number
	}
	steps: AddRoomProgressStep[]
	currentStep: AddRoomStepId | null
	nextStep: AddRoomStepId | null
	nextHref: string | null
	exitHref: string
}

const readinessInventoryMinDays = 30

export type VariantCompletion = {
	profileComplete: boolean
	photosComplete: boolean
	rateConfigured: boolean
	rateActive: boolean
	rateDefault: boolean
	pricingComplete: boolean
	conditionsComplete: boolean
	inventoryConfigComplete: boolean
	availabilityComplete: boolean
	setupComplete: boolean
	sellable: boolean
	selectedRatePlanId: string | null
}

export type VariantCompletionInput = Omit<VariantCompletion, "setupComplete" | "sellable">

export type RoomProfileReadinessInput = {
	hasCapacity: boolean
	hasPhysicalProfile: boolean
	hasBed: boolean
	hasPhysicalUnits: boolean
}

type CompletionAggregateVariant = {
	id: string
	capacity: {
		minOccupancy: number
		maxOccupancy: number
		maxAdults: number | null
		maxChildren: number | null
	} | null
}

export function isRoomProfileComplete(input: RoomProfileReadinessInput): boolean {
	return input.hasCapacity && input.hasPhysicalProfile && input.hasBed && input.hasPhysicalUnits
}

/**
 * Keeps setup readiness separate from commercial readiness. A draft tariff can
 * finish the guided forms, but a room is only sellable once that tariff is
 * active and primary.
 */
export function deriveVariantCompletion(input: VariantCompletionInput): VariantCompletion {
	const setupComplete =
		input.profileComplete &&
		input.photosComplete &&
		input.rateConfigured &&
		input.pricingComplete &&
		input.conditionsComplete &&
		input.inventoryConfigComplete &&
		input.availabilityComplete

	return {
		...input,
		setupComplete,
		sellable: setupComplete && input.rateActive && input.rateDefault,
	}
}

export function getAddRoomStepCompletion(
	completion: VariantCompletion
): Record<AddRoomStepId, boolean> {
	return {
		"choose-accommodation": true,
		"create-room": completion.profileComplete,
		"room-photos": completion.photosComplete,
		"create-rate": completion.rateConfigured && completion.pricingComplete,
		"conditions": completion.conditionsComplete,
		"availability": completion.availabilityComplete,
		"confirmation": completion.sellable,
	}
}

export async function loadVariantCompletion(
	productId: string,
	providerId: string,
	variantId: string,
	preferredRatePlanId?: string | null
): Promise<VariantCompletion | null> {
	const aggregate = await getProductVariantsAggregate(productId, providerId)
	if (!aggregate) return null

	const variant = aggregate.variants.find((item) => String(item.id) === variantId)
	if (!variant) return null

	return loadVariantCompletionForAggregateVariant(productId, variant, preferredRatePlanId)
}

/** Reuses an already-authorized product aggregate for list surfaces. */
export async function loadVariantCompletionForAggregateVariant(
	productId: string,
	variant: CompletionAggregateVariant,
	preferredRatePlanId?: string | null
): Promise<VariantCompletion> {
	const variantId = String(variant.id)

	const ratePlanName = await resolveRatePlanNameColumn()
	const todayIso = new Date().toISOString().slice(0, 10)
	const [inventoryRows, imageRows, inventoryConfigRows, roomProfileRows, bedRows, tariffRows] =
		await Promise.all([
			db
				.select({ variantId: DailyInventory.variantId })
				.from(DailyInventory)
				.where(
					and(
						eq(DailyInventory.variantId, variantId),
						gt(DailyInventory.date, todayIso),
						gt(DailyInventory.totalInventory, 0)
					)
				),
			db
				.select({ id: Image.id })
				.from(VariantImage)
				.innerJoin(Image, eq(Image.id, VariantImage.imageId))
				.where(eq(VariantImage.variantId, variantId)),
			db
				.select({ defaultTotalUnits: VariantInventoryConfig.defaultTotalUnits })
				.from(VariantInventoryConfig)
				.where(eq(VariantInventoryConfig.variantId, variantId)),
			db
				.select({ variantId: VariantRoomProfile.variantId })
				.from(VariantRoomProfile)
				.where(eq(VariantRoomProfile.variantId, variantId)),
			db
				.select({ count: VariantRoomBed.count })
				.from(VariantRoomBed)
				.where(eq(VariantRoomBed.variantId, variantId)),
			db
				.select({
					id: RatePlan.id,
					isActive: RatePlan.isActive,
					isDefault: RatePlan.isDefault,
				})
				.from(RatePlan)
				.where(eq(RatePlan.variantId, variantId))
				.orderBy(asc(ratePlanName), asc(RatePlan.id)),
		])

	const preferredTariffId = String(preferredRatePlanId ?? "").trim()
	const selectedRatePlan =
		(preferredTariffId ? tariffRows.find((row) => String(row.id) === preferredTariffId) : null) ??
		tariffRows.find((row) => Boolean(row.isDefault)) ??
		tariffRows.find((row) => Boolean(row.isActive)) ??
		tariffRows[0] ??
		null
	const inventoryConfigComplete = Number(inventoryConfigRows[0]?.defaultTotalUnits ?? 0) > 0
	const profileComplete = isRoomProfileComplete({
		hasCapacity: Boolean(variant.capacity),
		hasPhysicalProfile: roomProfileRows.length > 0,
		hasBed: bedRows.some((row) => Number(row.count ?? 0) > 0),
		hasPhysicalUnits: inventoryConfigComplete,
	})
	const photosComplete = imageRows.length > 0
	const selectedRatePlanId = selectedRatePlan ? String(selectedRatePlan.id) : null
	const rateConfigured = Boolean(selectedRatePlanId)
	const rateActive = Boolean(selectedRatePlan?.isActive)
	const rateDefault = Boolean(selectedRatePlan?.isDefault)
	const pricingBaseline = selectedRatePlanId
		? await baseRateRepository.getCanonicalPricingBaselineByRatePlanId(selectedRatePlanId)
		: null
	const pricingComplete = Number(pricingBaseline?.basePrice ?? 0) > 0
	const resolvedPolicies = selectedRatePlanId
		? await resolveEffectivePolicies({
				productId,
				variantId,
				ratePlanId: selectedRatePlanId,
				channel: "web",
				requiredCategories: [...REQUIRED_POLICY_CATEGORIES],
				onMissingCategory: "return_null",
			})
		: null
	const conditionsComplete = Boolean(
		resolvedPolicies && resolvedPolicies.missingCategories.length === 0
	)
	const availabilityComplete = inventoryRows.length >= readinessInventoryMinDays
	return deriveVariantCompletion({
		profileComplete,
		photosComplete,
		rateConfigured,
		rateActive,
		rateDefault,
		pricingComplete,
		conditionsComplete,
		inventoryConfigComplete,
		availabilityComplete,
		selectedRatePlanId,
	})
}

export async function evaluateAddRoomProgress(
	productId: string,
	providerId: string,
	options: {
		variantId?: string | null
		ratePlanId?: string | null
		currentStepId?: AddRoomStepId | string | null
	} = {}
): Promise<AddRoomProgressResult | null> {
	const variantId = String(options.variantId ?? "").trim()
	const ctx: AddRoomContext = {
		productId,
		variantId: variantId || undefined,
		ratePlanId: String(options.ratePlanId ?? "").trim() || undefined,
	}

	let completion: Record<AddRoomStepId, boolean> = {
		"choose-accommodation": Boolean(productId),
		"create-room": false,
		"room-photos": false,
		"create-rate": false,
		"conditions": false,
		"availability": false,
		"confirmation": false,
	}

	if (variantId) {
		const variantState = await loadVariantCompletion(
			productId,
			providerId,
			variantId,
			ctx.ratePlanId
		)
		if (!variantState) return null
		if (!ctx.ratePlanId && variantState.selectedRatePlanId) {
			ctx.ratePlanId = variantState.selectedRatePlanId
		}
		completion = getAddRoomStepCompletion(variantState)
	}

	const journeySteps = getAddRoomJourneySteps(ctx)
	const currentStepId =
		(options.currentStepId as AddRoomStepId | null) ??
		journeySteps.find((step) => !completion[step.id])?.id ??
		journeySteps[0]?.id ??
		null
	const nextStep = currentStepId ? getNextAddRoomStep(currentStepId, ctx) : null

	const steps: AddRoomProgressStep[] = journeySteps.map((step) => ({
		key: step.id,
		label: step.label,
		guestImpact: step.guestImpact,
		complete: completion[step.id],
		href: isAddRoomStepLinkable(step, ctx) ? step.buildHref(ctx) : "",
		isCurrent: step.id === currentStepId,
		isNext: step.id === nextStep?.id,
	}))

	const completedSteps = steps.filter((step) => step.complete).length
	const totalSteps = journeySteps.length

	return {
		playbookId: "add-room",
		productId,
		variantId: variantId || null,
		ratePlanId: ctx.ratePlanId ?? null,
		progress: {
			completedSteps,
			totalSteps,
			progressPercent: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
		},
		steps,
		currentStep: currentStepId,
		nextStep: nextStep?.id ?? null,
		nextHref: nextStep ? nextStep.buildHref(ctx) : null,
		exitHref: `/product/${encodeURIComponent(productId)}/rooms`,
	}
}

export function getAddRoomStepMeta(
	stepId: AddRoomStepId | string | null | undefined,
	ctx: AddRoomContext
) {
	const step = getAddRoomStepById(stepId, ctx)
	const position = getAddRoomStepPosition(stepId, ctx)

	return {
		step,
		stepNumber: position.stepNumber,
		totalSteps: position.totalSteps,
	}
}
