import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider commercial contract status", () => {
	it("keeps Tours agreements separate from the financial per-offer diagnostic", () => {
		const settings = read("src/pages/provider/settings/payments.astro")
		const finance = read("src/pages/api/internal/financial/contract-summary.ts")
		const card = read("src/components/provider/ProviderCommercialContractCard.astro")
		expect(settings).toContain("ProviderCommercialContractCard")
		expect(settings).toContain("enabled={agreementEnabled}")
		expect(settings).toContain("experiences={experiences}")
		expect(settings).toMatch(/const model = showTourAgreement\s*\? null/)
		expect(finance).toContain("loadProviderContractSurface")
		expect(card).toContain("data-commercial-contract-offerings")
		expect(card).toContain("Cobro mediante Fastt disponible para esta oferta.")
	})

	it("does not expose platform collection until policy, release and infrastructure agree", () => {
		const model = read("src/lib/commercial-policy/provider-contract-surface.ts")
		expect(model).toContain('collectionModel === "platform_collect"')
		expect(model).toContain('current.capabilityStates.collect_payment === "allowed"')
		expect(model).toContain('current.capabilityStates.payout === "allowed"')
		expect(model).toContain("collectionInfrastructure.available")
		expect(model).toContain("release.enabled")
	})
})
