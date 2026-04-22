import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()

function read(filePath: string) {
	return fs.readFileSync(path.join(ROOT, filePath), "utf8")
}

describe("audit/rateplan-first modern flows", () => {
	it("/rates/plans hub consume endpoint canónico y evita acceso DB directo", () => {
		const helper = read("src/lib/rates/loadRatePlansReadModel.ts")
		expect(helper).toContain('from "@/pages/api/rates/plans"')

		const page = read("src/pages/rates/plans/index.astro")
		expect(page).toContain("loadRatePlansReadModel")
		expect(page).not.toContain('from "astro:db"')
		expect(page).not.toContain("resolveEffectivePolicies")
	})

	it("detalle moderno consume read model y evita queries directas", () => {
		const detail = read("src/pages/rates/plans/[ratePlanId].astro")
		expect(detail).toContain("loadRatePlanReadModelById")
		expect(detail).not.toContain('from "astro:db"')
	})

	it("surfaces modernas operan con ratePlanId como input principal", () => {
		const pricingPage = read("src/pages/rates/plans/[ratePlanId]/pricing.astro")
		expect(pricingPage).toContain("ratePlanId")
		expect(pricingPage).not.toMatch(/variantId=\{/)

		const policiesPage = read("src/pages/rates/plans/[ratePlanId]/policies.astro")
		expect(policiesPage).toContain("ratePlanId")
		expect(policiesPage).not.toMatch(/variantId=\{/)
	})
})
