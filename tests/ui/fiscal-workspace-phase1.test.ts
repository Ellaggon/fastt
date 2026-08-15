import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("Fase 1 uses a single fiscal workspace shell across the four operational routes", () => {
	const layout = read("src/layouts/FiscalWorkspaceLayout.astro")
	const tabs = read("src/components/tax-fees/FiscalWorkspaceTabs.astro")
	const routes = read("src/lib/routes.ts")

	expect(layout).toContain("FiscalWorkspaceTabs")
	expect(layout).toContain("FiscalScopeSwitcher")
	expect(layout).toContain("FiscalStatusBar")
	expect(layout).toContain("FiscalPermissionNotice")
	expect(layout).toContain("rounded-lg border border-slate-200 bg-white")
	expect(tabs).toContain('label: "Definiciones"')
	expect(tabs).toContain('label: "Asignaciones"')
	expect(tabs).toContain('label: "Simulador"')
	expect(tabs).toContain('label: "Actividad"')
	expect(tabs.indexOf('id: "definitions"')).toBeLessThan(tabs.indexOf('id: "simulator"'))
	expect(tabs.indexOf('id: "simulator"')).toBeLessThan(tabs.indexOf('id: "assignments"'))
	expect(tabs.indexOf('id: "assignments"')).toBeLessThan(tabs.indexOf('id: "activity"'))
	expect(tabs).toContain("aria-current")
	expect(routes).toContain("providerSettingsTaxAssignments")
	expect(routes).toContain("providerSettingsTaxSimulator")
	expect(routes).toContain("providerSettingsTaxActivity")
})

test("Fase 1 removes the idle assistant panel and keeps the editor flat", () => {
	const page = read("src/components/tax-fees/TaxFeePage.tsx")
	const wizard = read("src/components/tax-fees/TaxFeeWizard.tsx")

	expect(page).not.toContain('>Asistente<')
	expect(page).not.toContain('rounded-[var(--fastt-radius-card)] border border-slate-200 p-4')
	expect(wizard).toContain("<section>")
	expect(wizard).not.toContain('<Card as="section">')
	expect(wizard).not.toContain("rounded-full border px-4 py-2 text-sm")
})
