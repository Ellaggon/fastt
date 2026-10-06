import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

function read(relativePath: string) {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("Guardrail: financial workspace uses shared line scope", () => {
	it("prepares scope on every financial page and avoids implicit first-product selection", () => {
		const financialPages = [
			"src/pages/financial/index.astro",
			"src/pages/financial/collections/index.astro",
			"src/pages/financial/settlements/index.astro",
			"src/pages/financial/provider-payables/index.astro",
			"src/pages/financial/refunds/index.astro",
			"src/pages/financial/exceptions/index.astro",
		]
		const violations = financialPages.flatMap((file) => {
			const source = read(file)
			const required = ["prepareFinancialWorkspaceScope", "scope={prepared.scope}"]
			return required.flatMap((signal) =>
				source.includes(signal) ? [] : [`${file}: missing ${signal}`]
			)
		})
		const workspace = read("src/components/financial/FinancialUnifiedWorkspace.astro")
		expect(violations).toEqual([])
		expect(workspace).toContain('id="financialScopeContext"')
		expect(workspace).toContain("data-product-ids")
		expect(workspace).toContain("data-ops-vocabulary")
		expect(workspace).toContain("data-vertical")
		expect(workspace).not.toMatch(/products\.find\([^)]+\)\s*\?\?\s*products\[0\]/)
	})

	it("never filters financial rows by scope in the browser; the server is the only scope boundary", () => {
		expect(existsSync(join(process.cwd(), "src/pages/financial/_client/financial-scope.ts"))).toBe(false)
		expect(
			existsSync(join(process.cwd(), "src/pages/financial/_client/financial-accommodation-scope.ts"))
		).toBe(false)
		const clientSources = execSync(
			"rg -n 'itemMatches(Financial|Accommodation)Scope|filterItemsBy(Financial|Accommodation)Scope|getFinancial(Accommodation)?Scope\\(' src/pages/financial src/components/financial || true",
			{ cwd: process.cwd(), encoding: "utf8" }
		).trim()
		expect(clientSources).toBe("")
		const legacyDom = execSync(
			"rg -n 'financialAccommodationContext' src/pages/financial src/components/financial || true",
			{ cwd: process.cwd(), encoding: "utf8" }
		).trim()
		expect(legacyDom).toBe("")
	})

	it("scopes the commercial contract card to the financial workspace line", () => {
		const financialIndex = read("src/pages/financial/index.astro")
		expect(financialIndex).toContain("filterProviderContractSurfaceByScope")
		expect(read("src/shared/infrastructure/db/schema/tables.ts")).toContain("agreementVersion")
		expect(read("src/modules/financial/domain/commission-snapshot.ts")).toContain("commercialLine")
	})

	it("avoids lodging-only copy in financial client surfaces", () => {
		const clientRoots = [
			"src/pages/financial/_client/financial-human-display.ts",
			"src/pages/financial/_client/financial-drawer-sections.ts",
			"src/pages/financial/collections/_client/collections-workspace.ts",
			"src/pages/financial/settlements/_client/settlements-workspace.ts",
			"src/pages/financial/refunds/_client/refunds-workspace.ts",
			"src/pages/financial/exceptions/_client/exceptions-workspace.ts",
			"src/pages/financial/provider-payables/_client/provider-payables-workspace.ts",
		]
		const banned = ["Estadía y huésped", 'detailRow("Alojamiento"', "placeholder=\"Buscar reserva, alojamiento"]
		const violations = clientRoots.flatMap((file) => {
			const source = read(file)
			return banned.flatMap((token) => (source.includes(token) ? [`${file}: ${token}`] : []))
		})
		expect(violations).toEqual([])
		expect(read("src/pages/financial/_client/financial-ops-vocabulary.ts")).toContain(
			"VerticalOpsVocabulary"
		)
		expect(read("src/pages/financial/_client/financial-page-boot.ts")).toContain(
			"applyFinancialOpsCopyToDocument"
		)
	})

	it("uses the financial context switcher in the top bar", () => {
		const topBar = read("src/components/dashboard/DashboardTopBar.astro")
		expect(topBar).toContain("FinancialContextSwitcher")
		expect(topBar).not.toContain('target="financial"')
		expect(topBar).not.toContain("AccommodationContextSwitcher")
	})

	it("propagates workspace scope through financial navigation and case links", () => {
		const subnav = read("src/components/financial/FinancialSubnav.astro")
		expect(subnav).toContain("withWorkspaceNavigationScope")
		const switcher = read("src/components/financial/FinancialContextSwitcher.astro")
		expect(switcher).toContain("withWorkspaceNavigationScope")
		const renderers = read("src/pages/financial/_client/financial-renderers.ts")
		expect(renderers).toContain("financialBookingDetailHref")
		const drawer = read("src/pages/financial/_client/financial-drawer-sections.ts")
		expect(drawer).toContain("financialBookingDetailHref")
		const humanDisplay = read("src/pages/financial/_client/financial-human-display.ts")
		expect(humanDisplay).toContain("financialBookingDetailHref")
		const router = read("src/pages/financial/_client/financial-workspace-router.ts")
		expect(router).toContain("withFinancialNavigationScope")
	})
})
