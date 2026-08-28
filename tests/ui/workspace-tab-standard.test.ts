import { readFileSync } from "node:fs"

import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("workspace subnavigation uses the Calendar/iCal standard from one component", () => {
	const standard = read("src/components/ui/TabsInsidePanel.astro")

	expect(standard).toContain('data-fastt-tab-standard="workspace"')
	expect(standard).toContain("w-full max-w-full")
	expect(standard).toContain("border-b border-slate-800")
	const globalStyles = read("src/styles/global.css")
	expect(globalStyles).toContain(".fastt-tabs-inside-panel__item")
	expect(globalStyles).toContain(".fastt-tabs-inside-panel__label")
	expect(globalStyles).toContain(".fastt-tabs-inside-panel__meta")
	expect(globalStyles).toContain(".fastt-tabs-inside-panel__status")
	expect(globalStyles).toContain(".fastt-tabs-inside-panel__status-dot")
	expect(globalStyles).toContain('data-trust-link-status-state="in_review"')
	expect(globalStyles).toContain('data-trust-link-status-state="action_needed"')
	expect(globalStyles).toContain("font-size: inherit")
	expect(globalStyles).toContain("line-height: inherit")
	expect(globalStyles).toContain('data-active="true"')
	expect(globalStyles).toContain("border-bottom: 2px solid transparent !important")
	expect(globalStyles).toContain("margin-bottom: -1px")
	expect(globalStyles).toContain("border-bottom-color: rgb(255 255 255) !important")
	expect(globalStyles).toContain("color: rgb(148 163 184)")
	expect(globalStyles).not.toContain("border-radius: 16px !important")
	expect(globalStyles).toContain(":focus-visible")

	for (const path of [
		"src/components/rates/CalendarSubnav.astro",
		"src/components/financial/FinancialSubnav.astro",
		"src/components/tax-fees/FiscalWorkspaceTabs.astro",
		"src/components/provider/ProviderSettingsSubnav.astro",
		"src/components/provider/integrations/ProviderIntegrationsSubnav.astro",
		"src/components/provider/ProviderTrustMapRail.astro",
	]) {
		const source = read(path)
		expect(source).toContain("TabsInsidePanel")
		expect(source).toContain("fastt-tabs-inside-panel__item")
	}

	expect(globalStyles).toContain(".fastt-tabs-inside-panel {")
	const fiscal = read("src/components/tax-fees/FiscalWorkspaceTabs.astro")
	expect(fiscal).toContain("class: classProp")
	expect(fiscal).toContain("<TabsInsidePanel class={classProp}")
	const calendar = read("src/components/rates/CalendarSubnav.astro")
	expect(calendar).toContain("CircleDollarSign")
	expect(calendar).toContain("Boxes")
	expect(calendar).toContain("Store")
	expect(calendar).toContain("FileText")
	expect(calendar).toContain('class="fastt-tabs-inside-panel__item"')
	expect(calendar).toContain("CALENDAR_CONTROL_MODES")
	expect(calendar).toContain('type="button"')
	expect(calendar).toContain("fastt:calendar-mode")
	expect(calendar).not.toContain("Link2")
	expect(calendar).not.toContain("<a")
	expect(calendar).not.toContain("CalendarDays")

	const settings = read("src/components/provider/ProviderSettingsSubnav.astro")
	expect(settings).toContain("LayoutDashboard")
	expect(settings).toContain("UserRound")
	expect(settings).toContain("Users")
	expect(settings).toContain("fastt-tabs-inside-panel__label")

	const financial = read("src/components/financial/FinancialSubnav.astro")
	expect(financial).toContain("max-w-full flex-nowrap")
	expect(financial).toContain("WalletCards")
	expect(financial).toContain("CircleDollarSign")
	expect(financial).toContain("HandCoins")
	expect(financial).toContain("RotateCcw")
	expect(financial).toContain("TriangleAlert")

	const verification = read("src/components/provider/ProviderTrustMapRail.astro")
	expect(verification).toContain("ShieldCheck")
	expect(verification).toContain("Briefcase")
	expect(verification).toContain("ReceiptText")
	expect(verification).toContain("CircleDollarSign")
	expect(verification).toContain("fastt-tabs-inside-panel__status")
	expect(verification).toContain("statusBadgeByState")
	expect(verification).toContain("link.stateLabel")
})
