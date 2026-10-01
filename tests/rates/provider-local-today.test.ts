import { describe, expect, it } from "vitest"
import { PgDialect } from "drizzle-orm/pg-core"
import { db, Product, eq } from "@/shared/infrastructure/db/compat"
import { providerLocalToday, providerLocalTimezone } from "@/lib/rates/providerLocalToday"

describe("provider local day SQL", () => {
	it("derives the date from the owned product's provider profile without session timezone", () => {
		const query = new PgDialect().sqlToQuery(providerLocalToday("tour-1"))
		expect(query.params).toEqual(["tour-1"])
		expect(query.sql).toContain('"ProviderProfile"."timezone"')
		expect(query.sql).toContain('"Product"."providerId" = "ProviderProfile"."providerId"')
		expect(query.sql).toContain('"Product"."id" = $1')
		expect(query.sql).toContain("CURRENT_TIMESTAMP AT TIME ZONE COALESCE")
		expect(query.sql).toContain("'UTC'))::date")
	})
	it("qualifies the nested projection even when Drizzle renders the outer select without column qualification", () => {
		const query = db
			.select({ timezone: providerLocalTimezone("tour-1") })
			.from(Product)
			.where(eq(Product.id, "tour-1"))
			.toSQL()
		expect(query.sql).toContain('"Product"."providerId" = "ProviderProfile"."providerId"')
		expect(query.sql).toContain('NULLIF("ProviderProfile"."timezone",')
		expect(query.sql).not.toContain('on "providerId" = "providerId"')
		expect(query.params).toEqual(["tour-1", "tour-1"])
	})
})
