import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S0-2 settings hub SSR readiness contract", () => {
	it("server-renders readiness/CTA and no longer ships a lying zero skeleton", () => {
		const page = read("src/pages/provider/settings/index.astro")
		const hydration = read("src/pages/provider/settings/_client/settings-summary-hydration.js")

		expect(page).toContain("buildProviderSettingsSummary")
		expect(page).toContain("primaryCtaHref")
		expect(page).toContain("primaryCtaLabel")
		expect(page).toContain("settings-summary-bootstrap")
		expect(page).toContain("data-settings-readiness")
		expect(page).not.toContain('progressLabel = "Cargando estado operativo..."')
		expect(page).not.toContain("const progressPercent = 0")
		expect(page).not.toContain("const blockers: any[] = []")

		expect(hydration).toContain("readBootstrapSummary")
		expect(hydration).toContain("hydrateSummary(bootstrapSummary)")
		expect(hydration).not.toContain("Qué bloquea qué")
		expect(hydration).toContain('data-settings-blocking-matrix')
		expect(hydration).toContain("data-settings-audit")
	})
})
