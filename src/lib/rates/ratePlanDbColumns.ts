import { RatePlan, sql } from "astro:db"

export const ratePlanNameColumn = sql<string>`"RatePlan"."name"`
export const ratePlanDescriptionColumn = sql<string>`"RatePlan"."description"`

export const ratePlanBaseSelect = {
	id: RatePlan.id,
	variantId: RatePlan.variantId,
	name: ratePlanNameColumn,
	description: ratePlanDescriptionColumn,
	isDefault: RatePlan.isDefault,
	isActive: RatePlan.isActive,
	createdAt: RatePlan.createdAt,
}
