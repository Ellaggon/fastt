import { db, RatePlan, sql } from "@/shared/infrastructure/db/compat"
import {
	ratePlanBaseSelect,
	ratePlanDescriptionColumn,
	ratePlanNameColumn,
} from "@/lib/rates/ratePlanDbColumns"

async function listRatePlanColumns(): Promise<Set<string>> {
	try {
		const rows = (await db.execute(sql`
			select column_name as name
			from information_schema.columns
			where table_schema = current_schema()
				and table_name = 'RatePlan'
		`)) as Array<{ name: string }>
		return new Set(rows.map((column) => String(column.name)))
	} catch {
		// Legacy Turso/libSQL compatibility for tests and old migration utilities.
	}

	const rows = await db.select({ name: sql<string>`name` }).from(sql`pragma_table_info('RatePlan')`)
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
