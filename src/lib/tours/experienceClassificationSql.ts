import { sql } from "@/shared/infrastructure/db/compat"
import type { SQL } from "drizzle-orm"
/** Effective discovery membership: modern selections exclude historical links. */
export function experienceCategoryMembership(productId: SQL, categoryId: SQL) {
	return sql`EXISTS (
  SELECT 1 FROM "Tour" classification
  WHERE classification."productId" = ${productId} AND (
   classification."primaryActivityCategoryId" = ${categoryId}
   OR ${categoryId} = (SELECT "parentCategoryId" FROM "ProductCategory" WHERE id = classification."primaryActivityCategoryId")
   OR EXISTS (SELECT 1 FROM "ProductCategoryLink" relation WHERE relation."productId" = ${productId} AND relation."categoryId" = ${categoryId} AND (classification."activityContractVersion" = 0 OR (relation."assignmentKind" = 'additional_theme' AND EXISTS (SELECT 1 FROM "ProductCategory" a JOIN "ProductCategory" f ON f.id = relation."categoryId" WHERE a.id = classification."primaryActivityCategoryId" AND a."isActive" AND f."isActive" AND f."classificationKind" = 'family' AND f.vertical = a.vertical AND f."dataClass" = a."dataClass" AND f.id = ANY(a."allowedAdditionalThemeIds")))))
   OR (classification."activityContractVersion" = 0 AND EXISTS (
    SELECT 1 FROM "ProductCategoryLink" relation JOIN "ProductCategory" legacy ON legacy.id = relation."categoryId"
    JOIN "ProductCategory" family ON family.id = ${categoryId} AND family."classificationKind" = 'family'
    WHERE relation."productId" = ${productId} AND family."searchAliasesJson" ? legacy.slug
   ))
  )
 )`
}
export function experienceCategoryFilter(productId: SQL, slugs: string[]) {
	return sql`EXISTS (SELECT 1 FROM "ProductCategory" category WHERE category.vertical = 'tour' AND category."isActive" AND category."dataClass" = 'production' AND (category.slug IN (${sql.join(
		slugs.map((slug) => sql`${slug}`),
		sql`, `
	)}) OR category."searchAliasesJson" ?| ARRAY[${sql.join(
		slugs.map((slug) => sql`${slug}`),
		sql`, `
	)}]::text[]) AND ${experienceCategoryMembership(productId, sql`category.id`)})`
}

/** The same duration buckets are used by dated and date-free discovery. */
export function experienceDurationFilter(minutes: SQL, bucket: string | null | undefined) {
	const limits = {
		up_to_4h: [0, 241],
		four_to_eight_hours: [241, 480],
		full_day: [480, 1440],
		multi_day: [1440, null],
	} as const
	if (!bucket || !Object.hasOwn(limits, bucket)) return undefined
	const [minimum, maximum] = limits[bucket as keyof typeof limits]
	return maximum === null
		? sql`${minutes} >= ${minimum}`
		: sql`${minutes} >= ${minimum} AND ${minutes} < ${maximum}`
}
