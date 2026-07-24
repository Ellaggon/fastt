import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"

import {
	callTinBureauLiveMatch,
	checkTinBureauMatch,
	getTinBureauStatus,
	resolveTinBureauPreference,
	tinBureauMatchLabel,
} from "@/lib/tin-bureau"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

const envKeys = [
	"TIN_BUREAU_PROVIDER",
	"TIN_BUREAU_API_KEY",
	"TIN_BUREAU_API_URL",
	"TIN_BUREAU_LIVE",
] as const

describe("P2 Fiscal TIN bureau beyond format", () => {
	afterEach(() => {
		for (const key of envKeys) delete process.env[key]
		vi.unstubAllGlobals()
	})

	it("returns host/admin narratives for format and simulated", async () => {
		expect(resolveTinBureauPreference()).toBe("format_only")
		const format = await checkTinBureauMatch({
			providerId: "p1",
			country: "BO",
			taxpayerId: "1234567",
			legalName: "Acme",
		})
		expect(format.matchStatus).toBe("format_ok")
		expect(format.hostNarrative.length).toBeGreaterThan(20)
		expect(format.adminNarrative).toMatch(/Formato OK/i)

		process.env.TIN_BUREAU_PROVIDER = "simulated"
		const match = await checkTinBureauMatch({
			providerId: "p1",
			country: "BO",
			taxpayerId: "1234567",
			legalName: "Acme",
		})
		expect(match.matchStatus).toBe("match")
		expect(match.hostNarrative).toMatch(/coincide/i)
		expect(tinBureauMatchLabel("match")).toMatch(/Coincide/i)

		const mismatch = await checkTinBureauMatch({
			providerId: "p1",
			country: "BO",
			taxpayerId: "1234500",
			legalName: "Acme",
		})
		expect(mismatch.matchStatus).toBe("mismatch")
		expect(mismatch.hostNarrative).toMatch(/no encontró coincidencia/i)
	})

	it("goes live only with API key + URL + TIN_BUREAU_LIVE", async () => {
		process.env.TIN_BUREAU_PROVIDER = "irs_tin_matching"
		process.env.TIN_BUREAU_API_KEY = "key"
		expect(getTinBureauStatus().mode).toBe("scaffold")

		process.env.TIN_BUREAU_API_URL = "https://vendor.test/tin-match"
		process.env.TIN_BUREAU_LIVE = "1"
		expect(getTinBureauStatus().mode).toBe("live")

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					matchStatus: "match",
					reference: "irs_ref_1",
					message: "TIN matched",
				}),
			}))
		)

		const live = await callTinBureauLiveMatch({
			providerId: "p1",
			country: "US",
			taxpayerId: "12-3456789",
			legalName: "Acme LLC",
		})
		expect(live.ok).toBe(true)
		expect(live.mode).toBe("live")
		expect(live.matchStatus).toBe("match")
		expect(live.externalRef).toBe("irs_ref_1")
		expect(live.hostNarrative).toMatch(/coincide/i)
	})

	it("wires narrative into tax upsert + host/admin UI", () => {
		const tax = read("src/lib/provider-tax-configuration.ts")
		const card = read("src/components/provider/ProviderTaxProfileCard.astro")
		const admin = read("src/pages/admin/providers.astro")
		const envExample = read(".env.example")

		expect(tax).toContain("checkTinBureauMatch")
		expect(tax).toContain("hostNarrative")
		expect(tax).toContain("adminNarrative")
		expect(tax).toContain("Provider.legalName")
		expect(card).toContain("data-tin-bureau-status")
		expect(card).toContain("hostNarrative")
		expect(admin).toContain("data-admin-tin-bureau")
		expect(envExample).toContain("TIN_BUREAU_LIVE")
		expect(envExample).toContain("TIN_BUREAU_API_URL")
	})
})
