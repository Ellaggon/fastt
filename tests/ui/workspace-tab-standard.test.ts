import { readFileSync } from "node:fs"

import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("workspace subnavigation uses the Calendar/iCal standard from one component", () => {
	const standard = read("src/components/ui/TabsInsidePanel.astro")

	expect(standard).toContain('data-fastt-tab-standard="workspace"')
	expect(standard).toContain("rounded-[20px]")
	expect(standard).toContain("bg-slate-900/60")
	expect(standard).toContain("backdrop-blur-sm")
	expect(standard).toContain("ring-slate-800")
	const globalStyles = read("src/styles/global.css")
	expect(globalStyles).toContain(".fastt-tabs-inside-panel__item")
	expect(globalStyles).toContain('data-active="true"')
	expect(globalStyles).toContain("border-radius: 16px !important")
	expect(globalStyles).toContain("color: rgb(148 163 184)")
	expect(globalStyles).toContain("background: rgb(30 41 59)")
	expect(globalStyles).toContain(":focus-visible")

	for (const path of [
		"src/components/rates/CalendarSubnav.astro",
		"src/components/financial/FinancialSubnav.astro",
		"src/components/tax-fees/FiscalWorkspaceTabs.astro",
		"src/components/provider/ProviderSettingsSubnav.astro",
		"src/components/provider/integrations/ProviderIntegrationsSubnav.astro",
	]) {
		const source = read(path)
		expect(source).toContain("TabsInsidePanel")
		expect(source).toContain("fastt-tabs-inside-panel__item")
	}

	expect(globalStyles).toContain(".fastt-tabs-inside-panel {")
	const calendar = read("src/components/rates/CalendarSubnav.astro")
	expect(calendar).toContain("CalendarDays")
	expect(calendar).toContain("Link2")
	expect(calendar).toContain("bg-slate-900/60 border-0 backdrop-blur-sm")
	expect(calendar).toContain("text-slate-400 hover:bg-slate-800 hover:text-slate-100")

	const financial = read("src/components/financial/FinancialSubnav.astro")
	expect(financial).toContain("max-w-full flex-nowrap")
	expect(financial).toContain("px-4 py-2 text-sm font-semibold whitespace-nowrap")
	expect(financial).toContain("text-slate-400 hover:bg-slate-800 hover:text-slate-100")
})
