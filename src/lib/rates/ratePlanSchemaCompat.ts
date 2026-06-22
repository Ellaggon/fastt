import { db, RatePlan, sql } from "astro:db"
import {
	ratePlanBaseSelect,
	ratePlanDescriptionColumn,
	ratePlanNameColumn,
} from "@/lib/rates/ratePlanDbColumns"

async function listRatePlanColumns(): Promise<Set<string>> {
	const rows = await db
		.select({ name: sql<string>`name` })
		.from(sql`pragma_table_info('RatePlan')`)
		.all()
	return new Set(rows.map((column) => String(column.name)))
}

export async function hasCompressedRatePlanSchema(): Promise<boolean> {
	return (await listRatePlanColumns()).has("name")
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
	const columns = await listRatePlanColumns()
	if (columns.has("name")) return ratePlanNameColumn
	if (columns.has("templateId")) return legacyRatePlanNameColumn
	return sql<string>`'Tarifa'`
}

export async function resolveRatePlanDescriptionColumn() {
	const columns = await listRatePlanColumns()
	if (columns.has("description")) return ratePlanDescriptionColumn
	if (columns.has("templateId")) return legacyRatePlanDescriptionColumn
	return sql<string | null>`null`
}

export async function resolveRatePlanBaseSelect() {
	const columns = await listRatePlanColumns()
	if (columns.has("name") && columns.has("description")) return ratePlanBaseSelect
	return {
		id: RatePlan.id,
		variantId: RatePlan.variantId,
		name: columns.has("name")
			? ratePlanNameColumn
			: columns.has("templateId")
				? legacyRatePlanNameColumn
				: sql<string>`'Tarifa'`,
		description: columns.has("description")
			? ratePlanDescriptionColumn
			: columns.has("templateId")
				? legacyRatePlanDescriptionColumn
				: sql<string | null>`null`,
		isDefault: RatePlan.isDefault,
		isActive: RatePlan.isActive,
		createdAt: RatePlan.createdAt,
	}
}
