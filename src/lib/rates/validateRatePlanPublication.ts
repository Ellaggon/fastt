import { baseRateRepository, variantInventoryConfigRepository } from "@/container"
import { getRequiredPolicyCategories } from "@/lib/policies/policy-business-contract"
import { getPolicyCategoryLabel } from "@/data/policy/policy-categories"
import { sellableDailyInventoryCondition } from "@/lib/rates/sellableDailyInventoryCondition"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import {
	and,
	count,
	DailyInventory,
	db,
	eq,
	first,
	gt,
	Product,
} from "@/shared/infrastructure/db/compat"

const MINIMUM_SELLABLE_AVAILABILITY_DAYS = 30

export async function validateRatePlanPublication(params: {
	ratePlanId: string
	variantId: string
	productId: string
}) {
	const todayIso = new Date().toISOString().slice(0, 10)
	const [baseline, inventory, availability, product] = await Promise.all([
		baseRateRepository.getCanonicalPricingBaselineByRatePlanId(params.ratePlanId),
		variantInventoryConfigRepository.getByVariantId(params.variantId),
		db
			.select({ value: count() })
			.from(DailyInventory)
			.where(
				and(
					eq(DailyInventory.variantId, params.variantId),
					gt(DailyInventory.date, todayIso),
					sellableDailyInventoryCondition()
				)
			),
		db
			.select({ productType: Product.productType })
			.from(Product)
			.where(eq(Product.id, params.productId))
			.then(first),
	])
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

	const blockers: string[] = []
	if (!baseline || Number(baseline.basePrice) <= 0) {
		blockers.push("Define un precio base mayor que cero.")
	}
	if (!inventory || Number(inventory.defaultTotalUnits) <= 0) {
		blockers.push(
			isTour
				? "Define el cupo físico de esta salida."
				: "Define cuántas unidades físicas tiene esta habitación."
		)
	}
	if (!requiredCategories.length) {
		blockers.push("Fastt aún no definió las condiciones para este tipo de oferta.")
	} else if (policies?.missingCategories.length) {
		const missingLabels = policies.missingCategories.map((category) =>
			getPolicyCategoryLabel(category)
		)
		blockers.push(`Completa las condiciones pendientes: ${missingLabels.join(", ")}.`)
	}
	if (Number(availability[0]?.value ?? 0) < minimumAvailabilityDays) {
		blockers.push(
			isTour
				? "Abre al menos una fecha futura con cupo para esta salida."
				: `Configura al menos ${MINIMUM_SELLABLE_AVAILABILITY_DAYS} noches con disponibilidad.`
		)
	}

	return { canPublish: blockers.length === 0, blockers }
}
