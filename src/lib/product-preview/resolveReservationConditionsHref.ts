import {
	first,
	and,
	asc,
	db,
	desc,
	eq,
	inArray,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"

import { routes } from "@/lib/routes"

export async function resolveReservationConditionsHref(params: {
	productId: string
	variantIds: string[]
}) {
	const productId = String(params.productId ?? "").trim()
	const variantIds = params.variantIds.map((id) => String(id ?? "").trim()).filter(Boolean)
	if (!productId || !variantIds.length) return routes.rates()

	const row = await db
		.select({ id: RatePlan.id })
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.where(and(inArray(RatePlan.variantId, variantIds), eq(Variant.productId, productId)))
		.orderBy(desc(RatePlan.isDefault), desc(RatePlan.isActive), asc(RatePlan.createdAt))
		.then(first)

	return row?.id ? routes.ratePlanPolicies(String(row.id)) : routes.rates()
}
