import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

function read(filePath: string) {
	return fs.readFileSync(path.join(ROOT, filePath), "utf8")
}

describe("audit/rateplan-first modern flows", () => {
	it("la lista de tarifas consume una surface compartida y evita acceso DB directo", () => {
		const surface = read("src/lib/rates/providerRatePlansSurface.ts")
		const endpoint = read("src/pages/api/rates/plans.ts")
		expect(surface).toContain("buildProviderRatePlansSurface")
		expect(endpoint).toContain("loadProviderRatePlansReadModel")

		expect(fs.existsSync(path.join(ROOT, "src/pages/rates/plans/index.astro"))).toBe(false)
		const page = read("src/pages/rates/plans/manage.astro")
		expect(page).toContain("buildProviderRatePlansSurface")
		expect(page).not.toContain("loadRatePlansReadModel")
		expect(page).not.toContain('from "@/shared/infrastructure/db/compat"')
		expect(page).not.toContain("resolveEffectivePolicies")
	})

	it("detalle moderno consume read model y evita queries directas", () => {
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")
		expect(detail).toContain("loadRatePlanReadModelById")
		expect(detail).not.toContain('from "@/shared/infrastructure/db/compat"')
	})

	it("surfaces modernas operan con ratePlanId como input principal", () => {
		const detailPage = read("src/pages/rates/plans/[ratePlanId].astro")
		expect(detailPage).toContain("RatePlanPricingSurface")
		expect(detailPage).toContain("ratePlanId={String(row.ratePlanId)}")
		expect(detailPage).not.toContain("routes.ratePlanPricing")
		expect(detailPage).not.toMatch(/variantId=\{/)

		expect(detailPage).toContain("RatePlanPoliciesSurface")
		expect(detailPage).toContain("loadRatePlanPoliciesData")
		expect(detailPage).not.toMatch(/variantId=\{/)

		expect(
			fs.existsSync(path.join(ROOT, "src/pages/rates/plans/[ratePlanId]/policies.astro"))
		).toBe(false)
		expect(read("src/lib/routes.ts")).toContain("?vista=conditions")
	})
})
