import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

async function source(path: string) {
	return readFile(new URL(path, root), "utf8")
}

describe("provider integration incremental ARI wiring", () => {
	it("coalesces minimal jobs and never stores a commercial snapshot in the queue", async () => {
		const queue = await source("src/lib/channel-manager/channel-manager-incremental-queue.ts")
		expect(queue).toContain("nextMinute")
		expect(queue).toContain("ON CONFLICT")
		expect(queue).toContain("variantIds")
		expect(queue).toContain("ratePlanIds")
		expect(queue).not.toContain("availableUnits")
		expect(queue).not.toContain("finalBasePrice")
	})

	it("recalculates canonical state and sends domains separately", async () => {
		const worker = await source("src/lib/channel-manager/channel-manager-incremental-ari.ts")
		expect(worker).toContain("recomputeEffectiveAvailabilityRange")
		expect(worker).toContain("ensurePricingCoverageRuntime")
		expect(worker).toContain("recomputeEffectiveRestrictionsForVariantRange")
		expect(worker).toContain("pushAvailability")
		expect(worker).toContain("pushRatesAndRestrictions")
		expect(worker).toContain("CHANNEX_DOMAIN_LIMIT_PER_MINUTE = 10")
	})

	it("hooks inventory, base pricing and restrictions into the outbox", async () => {
		const sources = await Promise.all([
			source("src/modules/inventory/application/use-cases/apply-inventory-mutation.ts"),
			source("src/pages/api/pricing/base-rate.ts"),
			source("src/lib/rates/restrictionsSurface.ts"),
		])
		for (const content of sources) {
			expect(content).toContain("enqueueProviderIncrementalAriChangeSoft")
		}
	})

	it("wires the production worker and keeps the initial full sync on a daily guard", async () => {
		const [vercel, initial] = await Promise.all([
			source("vercel.json"),
			source("src/lib/channel-manager/channel-manager-initial-ari.ts"),
		])
		expect(vercel).toContain('"path": "/api/cron/provider-integrations"')
		expect(vercel).toContain('"schedule": "27 3 * * *"')
		expect(initial).toContain("INITIAL_ARI_DAILY_LIMIT")
		expect(initial).toContain("86_400_000")
	})
})
