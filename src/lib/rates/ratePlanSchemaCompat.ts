import { db, RatePlan, sql } from "astro:db"
import {
	ratePlanBaseSelect,
	ratePlanDescriptionColumn,
	ratePlanNameColumn,
} from "@/lib/rates/ratePlanDbColumns"

export async function hasCompressedRatePlanSchema(): Promise<boolean> {
	const columns = await db
		.select({ name: sql<string>`name` })
		.from(sql`pragma_table_info('RatePlan')`)
		.all()

	return columns.some((column) => String(column.name) === "name")
}

export const legacyRatePlanNameColumn = sql<string>`(
	select "RatePlanTemplate"."name"
	from "RatePlanTemplate"
	where "RatePlanTemplate"."id" = "RatePlan"."templateId"
)`

export const legacyRatePlanDescriptionColumn = sql<string>`(
	select "RatePlanTemplate"."description"
	from "RatePlanTemplate"
	where "RatePlanTemplate"."id" = "RatePlan"."templateId"
)`

export async function resolveRatePlanNameColumn() {
	return (await hasCompressedRatePlanSchema()) ? ratePlanNameColumn : legacyRatePlanNameColumn
}

export async function resolveRatePlanDescriptionColumn() {
	return (await hasCompressedRatePlanSchema())
		? ratePlanDescriptionColumn
		: legacyRatePlanDescriptionColumn
}

export async function resolveRatePlanBaseSelect() {
	if (await hasCompressedRatePlanSchema()) return ratePlanBaseSelect
	return {
		id: RatePlan.id,
		variantId: RatePlan.variantId,
		name: legacyRatePlanNameColumn,
		description: legacyRatePlanDescriptionColumn,
		isDefault: RatePlan.isDefault,
		isActive: RatePlan.isActive,
		createdAt: RatePlan.createdAt,
	}
}
