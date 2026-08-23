import { readFileSync } from "node:fs"

import { expect, test } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

test("side sheets share one Drawer header, overlay dismiss, and icon-fact pattern", () => {
	const drawer = read("src/components/ui/Drawer.astro")
	const header = read("src/components/ui/DrawerHeader.astro")
	const fact = read("src/components/ui/DrawerFact.astro")
	const styles = read("src/styles/global.css")
	const reactSheet = read("src/components/ui-react/SideSheet.tsx")
	const preferences = read("src/components/dashboard/WorkspacePreferencesDrawer.astro")
	const policies = read("src/components/policy/RatePlanPoliciesSurface.astro")
	const docs = read("src/components/ui/README.md")

	const taxFees = read("src/components/tax-fees/TaxFeePage.tsx")

	expect(drawer).toContain("data-drawer-overlay")
	expect(drawer).toContain('role="dialog"')
	expect(drawer).toContain("data-drawer-side")
	expect(drawer).toContain("setDrawerOpen")
	expect(drawer).toContain("[data-drawer-open]")
	expect(drawer).toContain("[data-drawer-close]")
	expect(drawer).toContain('event.key !== "Escape"')

	expect(header).toContain("IconButton")
	expect(header).toContain("fastt-modal-close")
	expect(header).toContain('variant="secondary"')
	expect(header).toContain("data-drawer-close")
	expect(header).toContain("<X")

	expect(fact).toContain("fastt-drawer-fact")
	expect(fact).toContain('slot name="icon"')
	expect(styles).toContain(".fastt-drawer-overlay")
	expect(styles).toContain(".fastt-drawer-fact")
	expect(styles).toContain(".fastt-drawer-body")

	expect(reactSheet).toContain("IconButton")
	expect(reactSheet).toContain("fastt-modal-close")
	expect(reactSheet).toContain("fastt-drawer-overlay")
	expect(reactSheet).toContain("onClick={requestClose}")

	expect(preferences).toContain("DrawerHeader")
	expect(preferences).toContain("DrawerFact")
	expect(preferences).toContain("CalendarDays")
	expect(preferences).toContain("ShieldCheck")
	expect(preferences).not.toContain("<script>")

	expect(policies).toContain("DrawerHeader")
	expect(policies).toContain("data-drawer-open={technicalDrawerId}")
	expect(policies).not.toContain("setTechnicalDrawer")

	expect(docs).toContain("DrawerHeader")
	expect(docs).toContain("DrawerFact")
	expect(docs).toContain('data-drawer-open="<id>"')

	expect(taxFees).toContain("SideSheet")
	expect(taxFees).toContain("DrawerFact")
	expect(taxFees).toContain("Comprueba el cobro")
})
