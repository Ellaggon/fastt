import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import {
	backofficeRouteClassifications,
	backofficeShells,
	enterpriseNavigation,
} from "../../src/lib/backoffice-governance"

function toPosix(value: string): string {
	return value.replace(/\\/g, "/")
}

function walkFiles(root: string, extensions: string[]): string[] {
	const out: string[] = []
	function walk(current: string): void {
		for (const entry of readdirSync(current)) {
			const abs = join(current, entry)
			const stats = statSync(abs)
			if (stats.isDirectory()) {
				walk(abs)
				continue
			}
			if (stats.isFile() && extensions.some((extension) => abs.endsWith(extension))) {
				out.push(toPosix(relative(process.cwd(), abs)))
			}
		}
	}
	walk(root)
	return out.sort()
}

function pageRouteFromFile(relativePath: string): string {
	let route = relativePath
		.replace(/^src\/pages/, "")
		.replace(/\/index\.astro$/, "")
		.replace(/\.astro$/, "")
	if (route === "") route = "/"
	return route.replace(/\[([^\]]+)\]/g, ":$1")
}

function apiRouteFromFile(relativePath: string): string {
	return relativePath
		.replace(/^src\/pages/, "")
		.replace(/\.ts$/, "")
		.replace(/\[([^\]]+)\]/g, ":$1")
}

function escapeRegExp(value: string): string {
	return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
}

function patternToRegExp(pattern: string): RegExp {
	const escaped = escapeRegExp(pattern)
		.replace(/\/\*\*/g, "(?:/.*)?")
		.replace(/:\w+/g, "[^/]+")
	return new RegExp(`^${escaped}$`)
}

function matchingClassification(route: string): string | null {
	for (const classification of backofficeRouteClassifications) {
		if (patternToRegExp(classification.pattern).test(route)) return classification.pattern
	}
	return null
}

function flattenNavigationHrefs(): string[] {
	return enterpriseNavigation.flatMap((section) => section.items.map((item) => item.href))
}

describe("Guardrail: backoffice governance navigation", () => {
	it("keeps provider sidebar free of internal-only and legacy pricing destinations", () => {
		const hrefs = flattenNavigationHrefs()
		const violations = hrefs.filter(
			(href) => href.startsWith("/api/") || href === "/pricing/calendar"
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
				expect.objectContaining({ shell: "InternalAdminLayout", status: "canonical" }),
				expect.objectContaining({ shell: "DashboardLayout", status: "legacy" }),
				expect.objectContaining({ shell: "SearchLayout", status: "public" }),
			])
		)

		expect(backofficeRouteClassifications).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ pattern: "/api/internal/**", status: "internal-only" }),
				expect.objectContaining({ pattern: "/api/pricing/**", status: "canonical" }),
				expect.objectContaining({ pattern: "/pricing/calendar", status: "legacy" }),
				expect.objectContaining({ pattern: "/rates/plans/**", status: "canonical" }),
			])
		)
	})

	it("classifies every Astro page route in the governance source of truth", () => {
		const routes = walkFiles(join(process.cwd(), "src/pages"), [".astro"]).map(pageRouteFromFile)
		const missing = routes.filter((route) => matchingClassification(route) == null)

		expect(
			missing,
			`Every Astro route must have a governance classification:\n${missing.join("\n")}`
		).toEqual([])
	})

	it("classifies every API route family in the governance source of truth", () => {
		const routes = walkFiles(join(process.cwd(), "src/pages/api"), [".ts"]).map(apiRouteFromFile)
		const missing = routes.filter((route) => matchingClassification(route) == null)

		expect(
			missing,
			`Every API route must have a governance classification:\n${missing.join("\n")}`
		).toEqual([])
	})

	it("prevents legacy dashboard shell usage from active pages", () => {
		const pages = walkFiles(join(process.cwd(), "src/pages"), [".astro"])
		const violations = pages.filter((relativePath) =>
			readFileSync(join(process.cwd(), relativePath), "utf8").includes("DashboardLayout")
		)

		expect(
			violations,
			`Active pages must not import or render legacy DashboardLayout:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps internal admin shell isolated to admin routes", () => {
		const pages = walkFiles(join(process.cwd(), "src/pages"), [".astro"])
		const violations = pages.filter((relativePath) => {
			const source = readFileSync(join(process.cwd(), relativePath), "utf8")
			return source.includes("InternalAdminLayout") && !relativePath.startsWith("src/pages/admin/")
		})

		expect(
			violations,
			`InternalAdminLayout must only be used under src/pages/admin:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps internal admin shell from linking back into provider workspace", () => {
		const source = readFileSync(
			join(process.cwd(), "src/layouts/InternalAdminLayout.astro"),
			"utf8"
		)

		expect(source).not.toContain('href="/dashboard"')
		expect(source).toContain('href="/admin/providers"')
	})

	it("prevents legacy helpers and contradictory system naming from resurfacing", () => {
		const routesSource = readFileSync(join(process.cwd(), "src/lib/routes.ts"), "utf8")
		const sidebarSource = readFileSync(
			join(process.cwd(), "src/components/dashboard/DashboardSidebar.astro"),
			"utf8"
		)
		const integrationsSource = readFileSync(
			join(process.cwd(), "src/pages/system/integrations.astro"),
			"utf8"
		)

		expect(routesSource).not.toContain("pricingCalendar")
		expect(sidebarSource).not.toContain("/api/internal")
		expect(sidebarSource).not.toContain("Calendar (Deprecated)")
		expect(sidebarSource).not.toContain("Financial Control")
		expect(sidebarSource).not.toContain("Variant Inventory (To Update")
		expect(integrationsSource).not.toContain("System · Integrations")
	})
})
