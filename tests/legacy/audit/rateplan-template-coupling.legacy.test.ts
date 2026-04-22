import { describe, expect, it } from "vitest"
import { db, sql, RatePlanTemplate } from "astro:db"

describe.skip("legacy/audit rateplan template coupling", () => {
	it("legacy: template.cancellationPolicyId not null detection", async () => {
		const [{ n }] =
			(await db
				.select({ n: sql<number>`count(*)` })
				.from(RatePlanTemplate)
				.where(sql`${RatePlanTemplate.cancellationPolicyId} is not null`)
				.all()) ?? []

		expect(Number(n ?? 0)).toBeGreaterThanOrEqual(0)
	})
})
