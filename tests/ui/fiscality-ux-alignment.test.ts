import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")
test("fiscality uses a contextual header, segmented navigation and progressive filters", () => {
	expect(read("src/components/dashboard/DashboardTopBar.astro")).toContain("FiscalScopeSwitcher")
	expect(read("src/components/tax-fees/FiscalScopeSwitcher.astro")).toContain("Configuración comercial")
	expect(read("src/components/tax-fees/FiscalScopeSwitcher.astro")).toContain("Toda la cuenta")
	expect(read("src/components/tax-fees/FiscalScopeSwitcher.astro")).toContain("ContextSwitcher")
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).not.toContain("Relacionadas")
	const fiscalLayout = read("src/layouts/FiscalWorkspaceLayout.astro")
	expect(fiscalLayout).not.toContain("border-b border-slate-800 pb-5")
	expect(read("src/components/tax-fees/FiscalWorkspaceTabs.astro")).toContain("TabsInsidePanel")
	expect(read("src/components/tax-fees/FiscalWorkspaceTabs.astro")).toContain("fastt-tabs-inside-panel__item")
	expect(read("src/components/tax-fees/FiscalWorkspaceTabs.astro")).toContain('data-astro-prefetch="viewport"')
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).toContain("Identidad fiscal")
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).toContain("providerTaxIdentityPresentation")
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).toContain("identity.darkBadge")
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).toContain("flex flex-col gap-2")
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).toContain(
		"max-w-3xl text-sm leading-5 text-slate-300 sm:leading-6"
	)
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).toContain(
		"inline-flex w-fit items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
	)
	expect(read("src/layouts/FiscalWorkspaceLayout.astro")).toContain("text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl")
	expect(read("src/components/dashboard/DashboardTopBar.astro")).toContain("fastt-side-sheet--dark")
	expect(read("src/components/dashboard/DashboardTopBar.astro")).toContain("Abrir menú")
	expect(read("src/styles/global.css")).toContain("padding: 0.7rem 0.7rem 0.55rem")
	expect(read("src/components/tax-fees/FiscalSimulator.tsx")).toContain("py-8 sm:py-12")
	const reviewCenter = read("src/components/tax-fees/FiscalReviewCenter.tsx")
	expect(reviewCenter).toContain("Revisión pendiente")
	expect(reviewCenter).toContain("Configuración")
	expect(reviewCenter).toContain("Sugerencias")
	expect(read("src/components/tax-fees/TaxFeePage.tsx")).toContain("Filtrar definiciones visibles")
	expect(read("src/components/tax-fees/TaxFeePage.tsx")).toContain("Limpiar filtros")
	expect(read("src/components/tax-fees/TaxFeePage.tsx")).toContain('if (mode !== "idle")')
	expect(read("src/components/tax-fees/TaxFeePage.tsx")).toContain("Volver a definiciones")
})
