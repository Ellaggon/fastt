import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider commercial contract status", () => {
	it("shows the same contractual status in Settings and Finanzas", () => {
		const settings = read("src/pages/provider/settings/payments.astro")
		const finance = read("src/pages/financial/index.astro")
		const card = read("src/components/provider/ProviderCommercialContractCard.astro")
		expect(settings).toContain("ProviderCommercialContractCard")
		expect(finance).toContain("ProviderCommercialContractCard")
		expect(card).toContain("Modelo declarado")
		expect(card).toContain("Cobro mediante Fastt disponible para esta actividad y país.")
	})

	it("does not expose platform collection until policy, release and infrastructure agree", () => {
		const model = read("src/lib/commercial-policy/provider-contract-surface.ts")
		expect(model).toContain('platform.policyStatus === "supported"')
		expect(model).toContain("platform.capabilities.collect_payment")
		expect(model).toContain("platform.capabilities.payout")
		expect(model).toContain("release.enabled && collectionInfrastructure.available")
	})
})
