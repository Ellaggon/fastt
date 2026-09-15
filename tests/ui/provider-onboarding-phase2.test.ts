import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const root = new URL("../..", import.meta.url)
const source = (path: string) => readFile(new URL(path, root), "utf8")

describe("phase 2 guided preparation surface", () => {
	it("uses a focused shell instead of the operational workspace", async () => {
		const [playbook, guided] = await Promise.all([
			source("src/layouts/PlaybookLayout.astro"),
			source("src/layouts/GuidedPreparationLayout.astro"),
		])
		expect(playbook).toContain("GuidedPreparationLayout")
		expect(playbook).toContain(
			"const PlaybookShell = active ? GuidedPreparationLayout : WorkspaceLayout"
		)
		expect(guided).not.toContain("DashboardSidebar")
		expect(guided).toContain("Saltar al contenido")
	})

	it("records an owned product context and offers it again from the dashboard", async () => {
		const [playbook, dashboard, endpoint] = await Promise.all([
			source("src/layouts/PlaybookLayout.astro"),
			source("src/pages/dashboard/index.astro"),
			source("src/pages/api/onboarding/preparation-session.ts"),
		])
		expect(playbook).toContain("/api/onboarding/preparation-session")
		expect(playbook).toContain("variantId")
		expect(playbook).toContain("ratePlanId")
		expect(endpoint).toContain("eq(Product.providerId, providerId)")
		expect(dashboard).toContain("Retoma donde lo dejaste")
		expect(dashboard).toContain('data-product-vertical={isTour ? "tour" : "hotel"}')
		expect(dashboard).toContain("primera salida")
	})
})
