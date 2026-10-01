import { sql } from "@/shared/infrastructure/db/compat"

/** Use the provider's configured day, independently of browser/server timezone.
 * Legacy profiles without a timezone retain the explicit UTC fallback.
 */
export function providerLocalTimezone(productId: string) {
	return sql<string>`COALESCE((
 SELECT NULLIF("ProviderProfile"."timezone", '') FROM "ProviderProfile"
 INNER JOIN "Product" ON "Product"."providerId" = "ProviderProfile"."providerId"
 WHERE "Product"."id" = ${productId}
 ), 'UTC')`
}

export function providerLocalToday(productId: string) {
	return sql<string>`(CURRENT_TIMESTAMP AT TIME ZONE ${providerLocalTimezone(productId)})::date`
}
