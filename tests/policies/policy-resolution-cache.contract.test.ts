import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("policies/effective-resolution cache contract", () => {
	it("separa contextos comerciales que pueden resolver políticas distintas", () => {
		const base = {
			productId: "product-1",
			variantId: "variant-1",
			ratePlanId: "rate-1",
			asOfDate: "2026-09-22",
			channel: "web",
			requiredCategories: ["Payment", "Cancellation"],
		}
		const key = cacheKeys.policyResolution(base)

		expect(key).toContain("ws:policies:effective:product-1:variant-1:rate-1:2026-09-22:web")
		expect(key).toContain("Cancellation,Payment")
		expect(cacheKeys.policyResolution({ ...base, channel: "b2b" })).not.toBe(key)
		expect(cacheKeys.policyResolution({ ...base, asOfDate: "2026-09-23" })).not.toBe(key)
		expect(cacheTtls.policyResolution).toBe(20)
	})

	it("cachea sólo la resolución y la invalida en cada cambio contractual", () => {
		const publicApi = read("src/modules/policies/public.ts")
		const invalidation = read("src/lib/cache/invalidation.ts")
		const detailPage = read("src/pages/rates/plans/[ratePlanId].astro")

		expect(publicApi).toContain("readThrough(key, cacheTtls.policyResolution")
		expect(publicApi).toContain("policy_version_created")
		expect(publicApi).toContain("policy_assignment_replaced")
		expect(publicApi).toContain("policy_assignment_deactivated")
		expect(invalidation).toContain("cacheKeys.policyResolutionPrefix(params.productId)")
		expect(invalidation).toContain("cacheKeys.policyResolutionPrefix()")
		expect(detailPage).toContain('timing.time("policySurface"')
		expect(detailPage).toContain('timing.addTotal("total")')
	})
})
