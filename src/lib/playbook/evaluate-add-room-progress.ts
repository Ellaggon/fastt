import {
	and,
	asc,
	DailyInventory,
	EffectivePricingV2,
	eq,
	Image,
	inArray,
	RatePlan,
	db,
} from "astro:db"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"
import { buildOccupancyKey, normalizeOccupancy } from "@/shared/domain/occupancy"
import { getProductVariantsAggregate } from "@/modules/catalog/public"
import {
	type AddRoomContext,
	type AddRoomStepId,
	getAddRoomStepById,
	getApplicableAddRoomSteps,
	getNextAddRoomStep,
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
const INTERNAL_DEFAULT_OCCUPANCY_KEY = buildOccupancyKey(
	normalizeOccupancy({ adults: 2, children: 0, infants: 0 })
)

type VariantCompletion = {
	capacityComplete: boolean
	photosComplete: boolean
	tariffsComplete: boolean
	pricingComplete: boolean
	inventoryComplete: boolean
	isComplete: boolean
	defaultRatePlanId: string | null
}

async function loadVariantCompletion(
	productId: string,
	providerId: string,
	variantId: string
): Promise<VariantCompletion | null> {
	const aggregate = await getProductVariantsAggregate(productId, providerId)
	if (!aggregate) return null

	const variant = aggregate.variants.find((item) => String(item.id) === variantId)
	if (!variant) return null

	const ratePlanName = await resolveRatePlanNameColumn()
	const [effectiveRows, inventoryRows, imageRows, tariffRows] = await Promise.all([
		db
			.select({ variantId: RatePlan.variantId })
			.from(EffectivePricingV2)
			.innerJoin(RatePlan, eq(RatePlan.id, EffectivePricingV2.ratePlanId))
			.where(
				and(
					eq(RatePlan.variantId, variantId),
					eq(RatePlan.isDefault, true),
					eq(EffectivePricingV2.occupancyKey, INTERNAL_DEFAULT_OCCUPANCY_KEY)
				)
			)
			.all(),
		db
			.select({ variantId: DailyInventory.variantId })
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, variantId))
			.all(),
		db
			.select({ id: Image.id })
			.from(Image)
			.where(and(inArray(Image.entityType, ["variant", "Variant"]), eq(Image.entityId, variantId)))
			.all(),
		db
			.select({
				id: RatePlan.id,
				isActive: RatePlan.isActive,
				isDefault: RatePlan.isDefault,
			})
			.from(RatePlan)
			.where(eq(RatePlan.variantId, variantId))
			.orderBy(asc(ratePlanName), asc(RatePlan.id))
			.all(),
	])

	const activeTariffs = tariffRows.filter((row) => Boolean(row.isActive))
	const defaultTariff = activeTariffs.find((row) => row.isDefault) ?? activeTariffs[0] ?? null
	const capacityComplete = Boolean(variant.capacity)
	const photosComplete = imageRows.length > 0
	const tariffsComplete = activeTariffs.length > 0
	const pricingComplete = Boolean(
		variant.pricing?.hasBaseRate && variant.pricing?.hasDefaultRatePlan && effectiveRows.length > 0
	)
	const inventoryComplete = inventoryRows.length >= readinessInventoryMinDays
	const isComplete =
		capacityComplete && photosComplete && tariffsComplete && pricingComplete && inventoryComplete

	return {
		capacityComplete,
		photosComplete,
		tariffsComplete,
		pricingComplete,
		inventoryComplete,
		isComplete,
		defaultRatePlanId: defaultTariff ? String(defaultTariff.id) : null,
	}
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
		const variantState = await loadVariantCompletion(productId, providerId, variantId)
		if (!variantState) return null
		if (!ctx.ratePlanId && variantState.defaultRatePlanId) {
			ctx.ratePlanId = variantState.defaultRatePlanId
		}
		completion = {
			"choose-accommodation": true,
			"create-room": variantState.capacityComplete,
			"room-photos": variantState.photosComplete,
			"create-rate": variantState.tariffsComplete,
			"conditions": variantState.pricingComplete,
			"availability": variantState.inventoryComplete,
			"confirmation": variantState.isComplete,
		}
	}

	const applicableSteps = getApplicableAddRoomSteps(ctx)
	const currentStepId =
		(options.currentStepId as AddRoomStepId | null) ??
		applicableSteps.find((step) => !completion[step.id])?.id ??
		applicableSteps[0]?.id ??
		null
	const nextStep = currentStepId
		? getNextAddRoomStep(currentStepId, ctx)
		: (applicableSteps[0] ?? null)

	const steps: AddRoomProgressStep[] = applicableSteps.map((step) => ({
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
	const applicableSteps = getApplicableAddRoomSteps(ctx)
	const index = step ? applicableSteps.findIndex((item) => item.id === step.id) : -1

	return {
		step,
		stepNumber: index >= 0 ? index + 1 : null,
		totalSteps: applicableSteps.length,
	}
}
