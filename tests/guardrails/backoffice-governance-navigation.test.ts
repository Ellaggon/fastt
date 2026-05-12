import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
	backofficeRouteClassifications,
	backofficeShells,
	enterpriseNavigation,
} from "../../src/lib/backoffice-governance"

function flattenNavigationHrefs(): string[] {
	return enterpriseNavigation.flatMap((section) => section.items.map((item) => item.href))
}

describe("Guardrail: backoffice governance navigation", () => {
	it("keeps provider sidebar free of internal-only and legacy pricing destinations", () => {
		const hrefs = flattenNavigationHrefs()
		const violations = hrefs.filter(
			(href) =>
				href.startsWith("/api/") ||
				href.startsWith("/api/internal/") ||
				href === "/pricing/calendar"
		)

		expect(
			violations,
			`Enterprise navigation must not expose internal APIs or legacy pricing routes:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps navigation organized by enterprise ownership instead of generic buckets", () => {
		const sectionTitles = enterpriseNavigation.map((section) => section.title)
		expect(sectionTitles).toContain("Rooms & Rates")
		expect(sectionTitles).toContain("Administration & Governance")
		expect(sectionTitles).toContain("Connectivity")
		expect(sectionTitles).not.toContain("System")
		expect(sectionTitles).not.toContain("Financial Control")
	})

	it("declares shell and route governance source of truth", () => {
		expect(backofficeShells).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ shell: "WorkspaceLayout", status: "canonical" }),
				expect.objectContaining({ shell: "DashboardLayout", status: "legacy" }),
				expect.objectContaining({ shell: "SearchLayout", status: "public" }),
			])
		)

		expect(backofficeRouteClassifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ pattern: "/api/internal/**", status: "internal-only" }),
				expect.objectContaining({ pattern: "/pricing/calendar", status: "legacy" }),
				expect.objectContaining({ pattern: "/rates/plans/**", status: "canonical" }),
			])
		)
	})

	it("prevents the rendered sidebar from reintroducing internal API links or deprecated labels", () => {
		const sidebarSource = readFileSync(
			join(process.cwd(), "src/components/dashboard/DashboardSidebar.astro"),
			"utf8"
		)

		expect(sidebarSource).not.toContain("/api/internal")
		expect(sidebarSource).not.toContain("Calendar (Deprecated)")
		expect(sidebarSource).not.toContain("Financial Control")
		expect(sidebarSource).not.toContain("Variant Inventory (To Update")
	})
})
