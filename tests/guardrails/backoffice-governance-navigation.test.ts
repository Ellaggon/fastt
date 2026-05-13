import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import {
	backofficeRouteClassifications,
	backofficeShells,
	enterpriseNavigation,
	getGovernanceStatusMetadata,
	getOperationalContextMetadata,
} from "../../src/lib/backoffice-governance"
import type { BackofficeRouteClassification } from "../../src/lib/backoffice-governance"

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

function matchingClassification(route: string): BackofficeRouteClassification | null {
	for (const classification of backofficeRouteClassifications) {
		if (patternToRegExp(classification.pattern).test(route)) return classification
	}
	return null
}

function flattenNavigationHrefs(): string[] {
	return enterpriseNavigation.flatMap((section) => section.items.map((item) => item.href))
}

function isRedirectOnly(source: string): boolean {
	return source.includes("return Astro.redirect(") && !source.includes("<WorkspaceLayout")
}

function shellViolationForPage(route: string, relativePath: string): string | null {
	const source = readFileSync(join(process.cwd(), relativePath), "utf8")
	const classification = matchingClassification(route)
	if (!classification) return `${relativePath}: missing classification`
	if (isRedirectOnly(source)) return null

	const usesWorkspace = source.includes("WorkspaceLayout")
	const usesInternalAdmin = source.includes("InternalAdminLayout")
	const usesLegacyDashboard = source.includes("DashboardLayout")
	const usesPublicShell = source.includes("SearchLayout") || source.includes("UILayout")
	const usesBaseLayout = source.includes("@/layouts/Layout.astro")

	if (usesLegacyDashboard) return `${relativePath}: uses legacy DashboardLayout`
	if (classification.context === "internal-admin" && !usesInternalAdmin) {
		return `${relativePath}: internal-admin route must use InternalAdminLayout`
	}
	if (classification.context === "internal-admin" && usesWorkspace) {
		return `${relativePath}: internal-admin route must not use WorkspaceLayout`
	}
	if (
		["provider-workspace", "enterprise-operations", "governance"].includes(
			classification.context
		) &&
		!usesWorkspace
	) {
		return `${relativePath}: workspace route must use WorkspaceLayout`
	}
	if (classification.context === "public-marketplace" && (usesWorkspace || usesInternalAdmin)) {
		return `${relativePath}: public route must not use workspace/admin shell`
	}
	if (
		classification.context === "public-marketplace" &&
		!(usesPublicShell || usesBaseLayout || source.includes("<html"))
	) {
		return `${relativePath}: public route must use public/base shell`
	}
	return null
}

function extractInternalApiPaths(source: string): string[] {
	const matches = source.matchAll(/\/api\/internal\/[A-Za-z0-9_./-]+/g)
	return Array.from(matches, (match) => match[0].replace(/[")'`},].*$/, ""))
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

		for (const section of enterpriseNavigation) {
			expect(section.context, `${section.title} must declare its operational context`).toMatch(
				/^(provider-workspace|enterprise-operations|governance)$/
			)
			expect(section.owner, `${section.title} must declare operational owner`).not.toEqual("")
			expect(section.subtitle, `${section.title} must declare operational subtitle`).not.toEqual("")
			expect(
				section.operationalIntent,
				`${section.title} must describe operational intent`
			).not.toEqual("")
			expect(section.maturity, `${section.title} must declare maturity`).toMatch(
				/^(operational|transitional)$/
			)
		}
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
				expect.objectContaining({
					pattern: "/api/internal/dashboard-summary",
					status: "canonical",
				}),
				expect.objectContaining({
					pattern: "/api/internal/inventory/recompute",
					status: "transitional",
				}),
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

	it("keeps page shell usage aligned with route governance context", () => {
		const pages = walkFiles(join(process.cwd(), "src/pages"), [".astro"])
		const violations = pages
			.map((relativePath) => shellViolationForPage(pageRouteFromFile(relativePath), relativePath))
			.filter((violation): violation is string => Boolean(violation))

		expect(
			violations,
			`Route context and shell usage must stay aligned:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps enterprise navigation targets compatible with route classifications", () => {
		const violations = enterpriseNavigation.flatMap((section) =>
			section.items.flatMap((item) => {
				const classification = matchingClassification(item.href)
				if (!classification) return [`${section.title}/${item.label}: missing route classification`]
				const mismatches: string[] = []
				if (classification.status !== item.status) {
					mismatches.push(
						`${section.title}/${item.label}: nav=${item.status}, route=${classification.status}`
					)
				}
				if (classification.owner !== section.title) {
					mismatches.push(
						`${section.title}/${item.label}: section does not match owner ${classification.owner}`
					)
				}
				if (classification.status === "legacy" || classification.status === "internal-only") {
					mismatches.push(`${section.title}/${item.label}: exposes ${classification.status}`)
				}
				return mismatches
			})
		)

		expect(
			violations,
			`Enterprise navigation must point only to compatible canonical/transitional routes:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps planned enterprise modules visible but non-navigable", () => {
		const violations = enterpriseNavigation.flatMap((section) =>
			(section.planned ?? []).flatMap((label) => {
				if (!label.trim()) return [`${section.title}: empty planned module label`]
				const collidesWithActiveItem = section.items.some((item) => item.label === label)
				return collidesWithActiveItem
					? [`${section.title}/${label}: planned module also exists as an active navigation item`]
					: []
			})
		)

		expect(
			violations,
			`Planned modules must stay as non-clickable maturity markers:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("prepares Rooms & Rates as the next operational hub without implementing Capa 2", () => {
		const roomsAndRates = enterpriseNavigation.find((section) => section.title === "Rooms & Rates")
		expect(roomsAndRates).toBeDefined()
		expect(roomsAndRates?.maturity).toEqual("operational")
		expect(roomsAndRates?.operationalIntent).toContain("Commercial operating core")
		expect(roomsAndRates?.nextMaturity).toContain("Capa 2")
		expect(roomsAndRates?.planned).toEqual(
			expect.arrayContaining(["ARI Summary", "Restrictions", "Occupancy Pricing", "Audit History"])
		)
	})

	it("exposes human-readable context and status metadata for shell rendering", () => {
		expect(getOperationalContextMetadata("enterprise-operations").label).toEqual(
			"Enterprise Operations"
		)
		expect(getOperationalContextMetadata("provider-workspace").label).toEqual("Provider Workspace")
		expect(getGovernanceStatusMetadata("canonical").label).toEqual("Operational")
		expect(getGovernanceStatusMetadata("transitional").description).toContain(
			"not yet the final enterprise module"
		)
	})

	it("keeps enterprise shell context-aware instead of a generic wrapper", () => {
		const workspaceSource = readFileSync(
			join(process.cwd(), "src/layouts/WorkspaceLayout.astro"),
			"utf8"
		)
		const topbarSource = readFileSync(
			join(process.cwd(), "src/components/dashboard/DashboardTopBar.astro"),
			"utf8"
		)
		const sidebarSource = readFileSync(
			join(process.cwd(), "src/components/dashboard/DashboardSidebar.astro"),
			"utf8"
		)
		const itemSource = readFileSync(
			join(process.cwd(), "src/components/dashboard/DashboardSidebarItem.astro"),
			"utf8"
		)

		expect(workspaceSource).toContain("getBackofficeRouteClassification")
		expect(workspaceSource).toContain("getEnterpriseNavigationSection")
		expect(workspaceSource).toContain("data-workspace-context-panel")
		expect(workspaceSource).toContain("Transitional scope")
		expect(topbarSource).toContain("getOperationalContextMetadata")
		expect(topbarSource).not.toContain("classification.context")
		expect(sidebarSource).toContain("OTA Enterprise Workspace")
		expect(sidebarSource).toContain("section.planned")
		expect(sidebarSource).toContain("Roadmap markers")
		expect(sidebarSource).not.toContain(
			'<p class="text-[10px] font-semibold tracking-[0.08em] text-slate-600 uppercase">\n\t\t\t\t\t\t\tPlanned'
		)
		expect(itemSource).toContain("data-governance-status")
		expect(itemSource).not.toContain("(Transitional)")
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

	it("prevents provider-facing pages from calling truly internal-only APIs", () => {
		const pages = walkFiles(join(process.cwd(), "src/pages"), [".astro"])
		const violations = pages.flatMap((relativePath) => {
			const source = readFileSync(join(process.cwd(), relativePath), "utf8")
			return extractInternalApiPaths(source).flatMap((apiPath) => {
				const classification = matchingClassification(apiPath)
				if (classification?.status !== "internal-only") return []
				return [`${relativePath}: ${apiPath} is classified internal-only`]
			})
		})

		expect(
			violations,
			`Provider-facing pages must not call APIs classified as internal-only:\n${violations.join("\n")}`
		).toEqual([])
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
		expect(routesSource).not.toContain("catalog:")
		expect(sidebarSource).not.toContain("/api/internal")
		expect(sidebarSource).not.toContain("Calendar (Deprecated)")
		expect(sidebarSource).not.toContain("Financial Control")
		expect(sidebarSource).not.toContain("Variant Inventory (To Update")
		expect(sidebarSource).not.toContain("System")
		expect(integrationsSource).not.toContain("System · Integrations")
	})

	it("keeps legacy pricing calendar as redirect-only, not an operational workspace", () => {
		const source = readFileSync(join(process.cwd(), "src/pages/pricing/calendar.astro"), "utf8")

		expect(source).toContain("return Astro.redirect")
		expect(source).not.toContain("WorkspaceLayout")
		expect(source).not.toContain("PricingCalendar")
	})
})
