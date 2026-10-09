import { readTourRequestData } from "@/lib/tours/tourRequestReads"
import {
	evaluateEffectivePolicyReadiness,
	policyBusinessContextFromProduct,
} from "@/lib/policies/policy-business-compatibility"
import { baseRateRepository, variantInventoryConfigRepository } from "@/container"
import { getRequiredPolicyCategories } from "@/lib/policies/policy-business-contract"
import { getPolicyCategoryLabel } from "@/data/policy/policy-categories"
import { providerLocalToday, providerLocalTimezone } from "@/lib/rates/providerLocalToday"
import { sellableDailyInventoryCondition } from "@/lib/rates/sellableDailyInventoryCondition"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import {
	and,
	count,
	VariantCapacity,
	TourSlotProfile,
	DailyInventory,
	db,
	eq,
	first,
	gt,
	sql,
	Product,
} from "@/shared/infrastructure/db/compat"

const MINIMUM_SELLABLE_AVAILABILITY_DAYS = 30

async function loadPublicationContext(params: { productId: string; variantId: string }) {
	const [inventory, availability, product, capacity, configuredDates] = await Promise.all([
		variantInventoryConfigRepository.getByVariantId(params.variantId),
		db
			.select({ value: count() })
			.from(DailyInventory)
			.where(
				and(
					eq(DailyInventory.variantId, params.variantId),
					gt(DailyInventory.date, providerLocalToday(params.productId)),
					sellableDailyInventoryCondition()
				)
			),
		db
			.select({
				productType: Product.productType,
				timezone: providerLocalTimezone(params.productId),
			})
			.from(Product)
			.where(eq(Product.id, params.productId))
			.then(first),
		db
			.select({
				maxOccupancy: VariantCapacity.maxOccupancy,
				bookingMode: TourSlotProfile.bookingMode,
			})
			.from(VariantCapacity)
			.leftJoin(TourSlotProfile, eq(TourSlotProfile.variantId, VariantCapacity.variantId))
			.where(eq(VariantCapacity.variantId, params.variantId))
			.then(first),
		db
			.select({
				value: count(),
				futureDateCount: sql<number>`count(*) filter (where ${DailyInventory.date} > ${providerLocalToday(params.productId)})`,
				futureCapacityDateCount: sql<number>`count(*) filter (where ${DailyInventory.date} > ${providerLocalToday(params.productId)} and ${DailyInventory.totalInventory} > 0)`,
			})
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, params.variantId)),
	])
	return { inventory, availability, product, capacity, configuredDates }
}

export async function validateRatePlanPublication(params: {
	ratePlanId: string
	variantId: string
	productId: string
	request?: Request
}) {
	const [baseline, context] = await Promise.all([
		baseRateRepository.getCanonicalPricingBaselineByRatePlanId(params.ratePlanId),
		readTourRequestData(
			params.request,
			`publication-context:${params.productId}:${params.variantId}`,
			() => loadPublicationContext(params)
		),
	])
	const { inventory, availability, product, capacity, configuredDates } = context
	const requiredCategories = [...getRequiredPolicyCategories(product?.productType)]
	const isTour = String(product?.productType ?? "").toLowerCase() === "tour"
	const minimumAvailabilityDays = isTour ? 1 : MINIMUM_SELLABLE_AVAILABILITY_DAYS
	const policies = requiredCategories.length
		? await resolveEffectivePolicies({
				productId: params.productId,
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				channel: "web",
				requiredCategories,
				onMissingCategory: "return_null",
			})
		: null

	const policyReadiness = evaluateEffectivePolicyReadiness(
		policyBusinessContextFromProduct({
			productId: params.productId,
			productType: product?.productType,
		}),
		policies?.policies ?? [],
		policies?.missingCategories ?? requiredCategories
	)
	const compatibilityIssues = policyReadiness.compatibilityIssues
	const blockers: string[] = []
	const blockerDetails: Array<{ id: string; label: string }> = []
	const addBlocker = (id: string, label: string) => {
		blockers.push(label)
		blockerDetails.push({ id, label })
	}
	const priceReady = Boolean(
		baseline &&
		Number.isFinite(Number(baseline.basePrice)) &&
		Number(baseline.basePrice) > 0 &&
		(!isTour || /^[A-Z]{3}$/.test(baseline.currency))
	)
	if (!priceReady) {
		addBlocker("price", "Define un precio base mayor que cero.")
	}
	if (
		isTour
			? Number(capacity?.maxOccupancy ?? 0) <= 0
			: !inventory || Number(inventory.defaultTotalUnits) <= 0
	) {
		addBlocker(
			"capacity",
			isTour
				? "Define el máximo de participantes por grupo de esta opción."
				: "Define cuántas unidades físicas tiene esta habitación."
		)
	}
	if (!requiredCategories.length) {
		addBlocker("policy_contract", "Fastt aún no definió las condiciones para este tipo de oferta.")
	} else if (policies?.missingCategories.length) {
		const missingLabels = policies.missingCategories.map((category) =>
			getPolicyCategoryLabel(category)
		)
		addBlocker("conditions", `Completa las condiciones pendientes: ${missingLabels.join(", ")}.`)
	}
	if (compatibilityIssues.length)
		addBlocker("conditions", compatibilityIssues.map((issue) => issue.message).join(" "))
	if (
		isTour && capacity?.bookingMode === "private"
			? Number(configuredDates[0]?.value ?? 0) < 1
			: Number(availability[0]?.value ?? 0) < minimumAvailabilityDays
	) {
		addBlocker(
			"availability",
			isTour
				? capacity?.bookingMode === "private"
					? "Programa al menos una fecha de referencia para esta opción privada."
					: "Abre al menos una fecha futura con cupo para esta opción."
				: `Configura al menos ${MINIMUM_SELLABLE_AVAILABILITY_DAYS} noches con disponibilidad.`
		)
	}

	return {
		canPublish: blockers.length === 0,
		blockers,
		blockerDetails,
		observations: {
			timezone: product?.timezone ?? "UTC",
			priceReady,
			capacityReady: isTour
				? Number(capacity?.maxOccupancy ?? 0) > 0
				: Number(inventory?.defaultTotalUnits ?? 0) > 0,
			conditionsReady: policyReadiness.isSellableByContract,
			configuredDateCount: Number(configuredDates[0]?.value ?? 0),
			futureDateCount: Number(configuredDates[0]?.futureDateCount ?? 0),
			futureCapacityDateCount: Number(configuredDates[0]?.futureCapacityDateCount ?? 0),
			availableDateCount: Number(availability[0]?.value ?? 0),
		},
	}
}
