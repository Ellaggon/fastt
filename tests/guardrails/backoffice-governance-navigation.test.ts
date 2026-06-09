import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import {
	backofficeRouteClassifications,
	backofficeShells,
	enterpriseNavigation,
	filterEnterpriseNavigationForDisclosure,
	getGovernanceStatusMetadata,
	getOperationalContextMetadata,
	roomsAndRatesOperationalMap,
} from "../../src/lib/backoffice-governance"
import type { BackofficeRouteClassification } from "../../src/lib/backoffice-governance"
import {
	SIDEBAR_DISCLOSURE_THRESHOLDS,
	resolveDisclosureMode,
} from "../../src/lib/dashboard/providerSidebarReadiness"

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
	const routeWithoutHash = route.split("#")[0] ?? route
	for (const classification of backofficeRouteClassifications) {
		if (patternToRegExp(classification.pattern).test(routeWithoutHash)) return classification
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
			(href) => href.startsWith("/api/") || href === "/pricing" || href.startsWith("/pricing/")
		)

		expect(
			violations,
			`Enterprise navigation must not expose internal APIs, standalone pricing rules, or legacy pricing routes:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps pricing automation inside Pricing instead of standalone navigation", () => {
		const hrefs = flattenNavigationHrefs()
		const labels = enterpriseNavigation.flatMap((section) =>
			section.items.map((item) => item.label)
		)

		expect(hrefs).toContain("/rates/calendar")
		expect(hrefs).not.toContain("/pricing/rules")
		expect(labels).not.toContain("Commercial Rules")
		expect(labels).not.toContain("Pricing Rules & Promotions")
	})

	it("keeps navigation organized by enterprise ownership instead of generic buckets", () => {
		const sectionTitles = enterpriseNavigation.map((section) => section.title)
		expect(sectionTitles).toContain("Habitaciones y tarifas")
		expect(sectionTitles).toContain("Administración")
		expect(sectionTitles).toContain("Conectividad")
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
				expect.objectContaining({ shell: "DashboardLayout", status: "canonical" }),
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
				expect.objectContaining({ pattern: "/rates/calendar", status: "canonical" }),
				expect.objectContaining({ pattern: "/pricing", status: "legacy" }),
				expect.objectContaining({ pattern: "/pricing/calendar", status: "legacy" }),
				expect.objectContaining({
					pattern: "/product/:id/rooms/:roomId/inventory",
					status: "legacy",
				}),
				expect.objectContaining({ pattern: "/inventory", status: "transitional" }),
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
		const sectionOwnerAliases: Record<string, string[]> = {
			"Inicio": ["Command Center"],
			"Habitaciones y tarifas": ["Rooms & Rates"],
			"Reservas": ["Reservations"],
			"Catálogo de ofertas": ["Property Content", "Contenido de alojamiento"],
			"Contenido del alojamiento": ["Property Content", "Contenido de alojamiento"],
			"Pagos y finanzas": ["Payments & Finance"],
			"Analítica": ["Analytics & Performance"],
			"Conectividad": ["Connectivity"],
			"Administración": ["Administration & Governance"],
		}
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
				if (
					!(sectionOwnerAliases[section.title] ?? [section.title]).includes(classification.owner)
				) {
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

	it("uses progressive disclosure so small providers see an operational sidebar instead of roadmap", () => {
		const visible = filterEnterpriseNavigationForDisclosure(enterpriseNavigation, {
			mode: "small-provider",
		})
		const titles = visible.map((section) => section.title)
		const labels = visible.flatMap((section) => section.items.map((item) => item.label))
		const roomsAndRatesLabels =
			visible
				.find((section) => section.title === "Habitaciones y tarifas")
				?.items.map((item) => item.label) ?? []

		expect(titles).toContain("Habitaciones y tarifas")
		expect(titles).not.toContain("Analítica")
		expect(titles).not.toContain("Conectividad")
		expect(roomsAndRatesLabels).toEqual(["Tarifas", "Calendario", "Condiciones"])
		expect(labels).not.toContain("Inventario físico")
		expect(labels).not.toContain("Reglas de venta")
		expect(labels).not.toContain("Operaciones masivas")
		expect(labels).not.toContain("Auditoría")
		expect(visible.flatMap((section) => section.planned ?? [])).toEqual([])
	})

	it("reveals professional surfaces when the provider has scale", () => {
		const visible = filterEnterpriseNavigationForDisclosure(enterpriseNavigation, {
			mode: "scaled-provider",
		})
		const titles = visible.map((section) => section.title)
		const labels = visible.flatMap((section) => section.items.map((item) => item.label))
		const planned = visible.flatMap((section) => section.planned ?? [])

		expect(titles).toContain("Analítica")
		expect(titles).toContain("Conectividad")
		expect(labels).toContain("Inventario físico")
		expect(labels).toContain("Reglas de venta")
		expect(labels).toContain("Operaciones masivas")
		expect(labels).toContain("Auditoría")
		expect(planned).toContain("Revenue management")
		expect(planned).toContain("Channel manager")
	})

	it("reveals professional surfaces when tools are explicitly activated", () => {
		const visible = filterEnterpriseNavigationForDisclosure(enterpriseNavigation, {
			mode: "professional-tools",
		})
		const labels = visible.flatMap((section) => section.items.map((item) => item.label))

		expect(labels).toContain("Inventario físico")
		expect(labels).toContain("Reglas de venta")
		expect(labels).toContain("Operaciones masivas")
		expect(labels).toContain("Auditoría")
	})

	it("does not reveal advanced Rooms & Rates just because an advanced route is active", () => {
		const visible = filterEnterpriseNavigationForDisclosure(enterpriseNavigation, {
			mode: "small-provider",
			activeHref: "/rates/restrictions",
		})
		const roomsAndRatesLabels =
			visible
				.find((section) => section.title === "Habitaciones y tarifas")
				?.items.map((item) => item.label) ?? []

		expect(roomsAndRatesLabels).toEqual(["Tarifas", "Calendario", "Condiciones"])
	})

	it("keeps small providers below explicit scale thresholds", () => {
		expect(
			resolveDisclosureMode({
				ratePlanIds: Array.from(
					{ length: SIDEBAR_DISCLOSURE_THRESHOLDS.ratePlans - 1 },
					(_, index) => `rate-${index}`
				),
				variantIds: Array.from(
					{ length: SIDEBAR_DISCLOSURE_THRESHOLDS.variants - 1 },
					(_, index) => `variant-${index}`
				),
				activePriceRules: SIDEBAR_DISCLOSURE_THRESHOLDS.activePriceRules - 1,
				activeRestrictions: SIDEBAR_DISCLOSURE_THRESHOLDS.activeRestrictions - 1,
			})
		).toBe("small-provider")
	})

	it("reveals advanced navigation only when a scale threshold is reached", () => {
		const baseMetrics = {
			ratePlanIds: [],
			variantIds: [],
			activePriceRules: 0,
			activeRestrictions: 0,
		}

		expect(
			resolveDisclosureMode({
				...baseMetrics,
				ratePlanIds: Array.from(
					{ length: SIDEBAR_DISCLOSURE_THRESHOLDS.ratePlans },
					(_, index) => `rate-${index}`
				),
			})
		).toBe("scaled-provider")
		expect(
			resolveDisclosureMode({
				...baseMetrics,
				variantIds: Array.from(
					{ length: SIDEBAR_DISCLOSURE_THRESHOLDS.variants },
					(_, index) => `variant-${index}`
				),
			})
		).toBe("scaled-provider")
		expect(
			resolveDisclosureMode({
				...baseMetrics,
				activePriceRules: SIDEBAR_DISCLOSURE_THRESHOLDS.activePriceRules,
			})
		).toBe("scaled-provider")
		expect(
			resolveDisclosureMode({
				...baseMetrics,
				activeRestrictions: SIDEBAR_DISCLOSURE_THRESHOLDS.activeRestrictions,
			})
		).toBe("scaled-provider")
	})

	it("reveals advanced navigation by explicit activation or professional role", () => {
		const baseMetrics = {
			ratePlanIds: [],
			variantIds: [],
			activePriceRules: 0,
			activeRestrictions: 0,
		}

		expect(resolveDisclosureMode(baseMetrics, { professionalToolsEnabled: true })).toBe(
			"professional-tools"
		)
		expect(resolveDisclosureMode(baseMetrics, { providerRole: "admin" })).toBe("professional-tools")
		expect(resolveDisclosureMode(baseMetrics, { providerRole: "revenue_ops" })).toBe("revenue-ops")
		expect(resolveDisclosureMode(baseMetrics, { providerRole: "internal_admin" })).toBe(
			"internal-admin"
		)
	})

	it("persists professional tools in provider profile instead of creating workspace tables", () => {
		const config = readFileSync(join(process.cwd(), "db/config.ts"), "utf8")
		const migration = readFileSync(
			join(process.cwd(), "db/migrations/2026-06-09_provider_profile_professional_tools.sql"),
			"utf8"
		)
		const preferences = readFileSync(
			join(process.cwd(), "src/lib/providerProfessionalToolsPreference.ts"),
			"utf8"
		)
		const sidebar = readFileSync(
			join(process.cwd(), "src/components/dashboard/DashboardSidebar.astro"),
			"utf8"
		)
		const settings = readFileSync(join(process.cwd(), "src/pages/provider/index.astro"), "utf8")
		const endpoint = readFileSync(
			join(process.cwd(), "src/pages/api/provider/preferences/professional-tools.ts"),
			"utf8"
		)

		expect(config).toContain("professionalToolsEnabled")
		expect(config).toContain("professionalToolsUpdatedAt")
		expect(config).toContain("professionalToolsUpdatedBy")
		expect(config).not.toContain("ProviderWorkspacePreferences")
		expect(config).not.toContain("ProviderWorkspaceAuditLog")
		expect(migration).toContain('ALTER TABLE "ProviderProfile"')
		expect(migration).toContain('"professionalToolsEnabled"')
		expect(migration).not.toContain('CREATE TABLE IF NOT EXISTS "ProviderWorkspacePreferences"')
		expect(migration).not.toContain('CREATE TABLE IF NOT EXISTS "ProviderWorkspaceAuditLog"')
		expect(preferences).toContain("getProviderProfessionalToolsPreference")
		expect(preferences).toContain("setProviderProfessionalToolsPreference")
		expect(preferences).toContain("ProviderProfile")
		expect(preferences).not.toContain("ProviderWorkspacePreferences")
		expect(preferences).not.toContain("ProviderWorkspaceAuditLog")
		expect(preferences).not.toContain("fastt_professional_tools")
		expect(sidebar).toContain("getProviderSidebarData")
		expect(sidebar).not.toContain("professionalToolsEnabled:")
		expect(settings).toContain("Herramientas profesionales")
		expect(settings).toContain("Mostrar herramientas profesionales")
		expect(settings).toContain("/api/provider/preferences/professional-tools")
		expect(endpoint).toContain("requireProvider")
		expect(endpoint).toContain("setProviderProfessionalToolsPreference")
	})

	it("keeps advanced routes hidden when the provider is in simple mode", () => {
		const visible = filterEnterpriseNavigationForDisclosure(enterpriseNavigation, {
			mode: "small-provider",
			activeHref: "/analytics/revenue",
		})

		expect(visible.map((section) => section.title)).not.toContain("Analítica")
		expect(visible.flatMap((section) => section.items.map((item) => item.href))).not.toContain(
			"/analytics/revenue"
		)
	})

	it("keeps Rooms & Rates as an enterprise ARI hub with explicit ownership lanes", () => {
		const roomsAndRates = enterpriseNavigation.find(
			(section) => section.title === "Habitaciones y tarifas"
		)
		expect(roomsAndRates).toBeDefined()
		expect(roomsAndRates?.maturity).toEqual("operational")
		expect(roomsAndRates?.operationalIntent).toContain("tarifas")
		expect(roomsAndRates?.operationalIntent).toContain("restricciones de venta")
		expect(roomsAndRates?.nextMaturity).toBeUndefined()
		expect(roomsAndRates?.items[0]?.label).toEqual("Tarifas")
		expect(roomsAndRates?.items.map((item) => item.label)).toEqual(
			expect.arrayContaining([
				"Calendario",
				"Inventario físico",
				"Reglas de venta",
				"Operaciones masivas",
				"Tarifas",
				"Condiciones",
			])
		)
		expect(roomsAndRates?.items.find((item) => item.label === "Calendario")?.status).toEqual(
			"canonical"
		)
		expect(roomsAndRates?.items.find((item) => item.label === "Inventario físico")?.status).toEqual(
			"transitional"
		)
		expect(roomsAndRates?.items.find((item) => item.label === "Bulk Pricing")).toBeUndefined()
		expect(roomsAndRates?.items.find((item) => item.label === "Bulk Inventory")).toBeUndefined()
		expect(roomsAndRates?.items.find((item) => item.label === "Hub de tarifas")).toBeUndefined()
		expect(roomsAndRates?.items.find((item) => item.label === "Reglas de venta")?.status).toEqual(
			"canonical"
		)
		expect(roomsAndRates?.planned ?? []).not.toContain("Pricing por ocupación")
		expect(roomsAndRates?.planned ?? []).not.toContain("Historial de auditoría")
		expect(roomsAndRates?.planned ?? []).not.toContain("Pricing Calendar")
		expect(roomsAndRates?.planned ?? []).not.toContain("Inventory Calendar")
		expect(roomsAndRates?.planned ?? []).not.toContain("Restrictions")
	})

	it("enforces physical vs commercial ownership separation inside Rooms & Rates", () => {
		const ownerships = new Set<string>(roomsAndRatesOperationalMap.map((lane) => lane.ownership))
		expect(ownerships.has("commercial")).toBe(true)
		expect(ownerships.has("physical")).toBe(true)
		expect(ownerships.has("planned")).toBe(false)

		const physicalHrefViolations = roomsAndRatesOperationalMap
			.filter((lane) => lane.ownership === "physical")
			.flatMap((lane) =>
				lane.surfaces.flatMap((surface) => {
					if (!surface.href) return []
					return surface.href.startsWith("/pricing") || surface.href.includes("/pricing")
						? [`${lane.title}/${surface.label}: physical lane must not navigate to pricing`]
						: []
				})
			)

		const commercialHrefViolations = roomsAndRatesOperationalMap
			.filter((lane) => lane.ownership === "commercial")
			.flatMap((lane) =>
				lane.surfaces.flatMap((surface) => {
					if (!surface.href) return []
					return surface.href.startsWith("/product/") && surface.href.includes("/variants/")
						? [
								`${lane.title}/${surface.label}: commercial lane must not navigate to variant internals`,
							]
						: []
				})
			)

		const plannedHrefViolations = roomsAndRatesOperationalMap
			.filter((lane) => lane.status === "planned")
			.flatMap((lane) =>
				lane.surfaces.flatMap((surface) =>
					surface.href ? [`${lane.title}/${surface.label}: planned ARI surfaces must not link`] : []
				)
			)

		expect(
			[...physicalHrefViolations, ...commercialHrefViolations, ...plannedHrefViolations],
			`Rooms & Rates lanes must keep ARI ownership boundaries explicit:\n${[
				...physicalHrefViolations,
				...commercialHrefViolations,
				...plannedHrefViolations,
			].join("\n")}`
		).toEqual([])
	})

	it("removes the visible Rooms & Rates hub page from provider navigation", () => {
		const routes = readFileSync(join(process.cwd(), "src/lib/routes.ts"), "utf8")
		const subnav = readFileSync(
			join(process.cwd(), "src/components/pricing/PricingSubnav.astro"),
			"utf8"
		)

		expect(existsSync(join(process.cwd(), "src/pages/rates/plans/index.astro"))).toBe(false)
		expect(routes).not.toContain("ratePlansHub")
		expect(subnav).not.toContain("Hub de tarifas")
	})

	it("exposes human-readable context and status metadata for shell rendering", () => {
		expect(getOperationalContextMetadata("enterprise-operations").label).toEqual(
			"Operación comercial"
		)
		expect(getOperationalContextMetadata("provider-workspace").label).toEqual(
			"Espacio del proveedor"
		)
		expect(getGovernanceStatusMetadata("canonical").label).toEqual("Operational")
		expect(getGovernanceStatusMetadata("transitional").description).toContain(
			"not yet the final enterprise module"
		)
	})

	it("keeps enterprise shell lean so page headers own identity", () => {
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

		expect(workspaceSource).not.toContain("getBackofficeRouteClassification")
		expect(workspaceSource).not.toContain("getEnterpriseNavigationSection")
		expect(workspaceSource).not.toContain("data-workspace-context-panel")
		expect(workspaceSource).not.toContain("isTransitionalSurface")
		expect(workspaceSource).not.toContain("activeSection?.nextMaturity")
		expect(workspaceSource).not.toContain("activeSection?.operationalIntent")
		expect(topbarSource).not.toContain("getOperationalContextMetadata")
		expect(topbarSource).not.toContain("classification.context")
		expect(topbarSource).not.toContain("{title}")
		expect(sidebarSource).toContain("Panel del proveedor")
		expect(sidebarSource).toContain("getProviderSidebarData")
		expect(sidebarSource).toContain("filterEnterpriseNavigationForDisclosure")
		expect(sidebarSource).toContain("sidebarReadiness[item.href]")
		expect(sidebarSource).toContain("section.planned")
		expect(sidebarSource).toContain("Próximamente")
		expect(sidebarSource).toContain("isRoomSurface")
		expect(sidebarSource).toContain("routes.productRooms()")
		expect(sidebarSource).not.toContain("12 tarifas")
		expect(sidebarSource).not.toContain("9 listas")
		expect(sidebarSource).not.toContain("3 incompletas")
		expect(sidebarSource).not.toContain(
			'<p class="text-[10px] font-semibold tracking-[0.08em] text-slate-600 uppercase">\n\t\t\t\t\t\t\tPlanned'
		)
		expect(itemSource).toContain("data-governance-status")
		expect(itemSource).not.toContain("(Transitional)")
	})

	it("keeps DashboardLayout absorbed into the canonical sidebar navigation", () => {
		const dashboardLayoutSource = readFileSync(
			join(process.cwd(), "src/layouts/DashboardLayout.astro"),
			"utf8"
		)

		expect(existsSync(join(process.cwd(), "src/components/nav/NavDashboardLayout.astro"))).toBe(
			false
		)
		expect(existsSync(join(process.cwd(), "src/components/nav/NavDashboardBurger.astro"))).toBe(
			false
		)
		expect(dashboardLayoutSource).toContain("WorkspaceLayout")
		expect(dashboardLayoutSource).not.toContain("NavDashboardLayout")
		expect(dashboardLayoutSource).not.toContain("NavDashboardBurger")
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
		const pricing = readFileSync(join(process.cwd(), "src/pages/pricing/index.astro"), "utf8")
		const calendar = readFileSync(join(process.cwd(), "src/pages/pricing/calendar.astro"), "utf8")
		const rules = readFileSync(join(process.cwd(), "src/pages/pricing/rules.astro"), "utf8")
		const roomInventory = readFileSync(
			join(process.cwd(), "src/pages/product/[id]/rooms/[roomId]/inventory.astro"),
			"utf8"
		)

		for (const source of [pricing, calendar, rules, roomInventory]) {
			expect(source).toContain("return Astro.redirect")
			expect(source).not.toContain("WorkspaceLayout")
			expect(source).not.toContain("PricingCalendar")
		}
		expect(calendar).toContain("target.search = Astro.url.search")
		expect(rules).toContain('target.hash = "pricing-automation"')
		expect(roomInventory).toContain('target.searchParams.set("focus", "availability")')
	})

	it("keeps visible CTAs and route helpers off legacy /pricing destinations", () => {
		const files = [
			...walkFiles(join(process.cwd(), "src/pages"), [".astro", ".ts"]).filter(
				(file) => !file.startsWith("src/pages/api/") && !file.startsWith("src/pages/pricing/")
			),
			...walkFiles(join(process.cwd(), "src/components"), [".astro", ".ts"]),
			"src/lib/routes.ts",
		]
		const visibleLegacyPricingPattern =
			/(?:href|action)=\{?["'`]\/pricing(?:[/?#"'`}]|$)|Astro\.redirect\(["'`]\/pricing(?:[/?#"'`]|$)|=>\s*["'`]\/pricing(?:[/?#"'`]|$)/
		const violations = files.flatMap((file) => {
			const source = readFileSync(join(process.cwd(), file), "utf8")
			return visibleLegacyPricingPattern.test(source) ? [file] : []
		})

		expect(
			violations,
			`Visible UX must use /rates/calendar; /pricing is redirect-only legacy:\n${violations.join("\n")}`
		).toEqual([])
		const routesSource = readFileSync(join(process.cwd(), "src/lib/routes.ts"), "utf8")
		expect(routesSource).toContain('pricing: () => "/rates/calendar"')
		expect(routesSource).toContain('pricingAutomation: () => "/rates/calendar#pricing-automation"')
		expect(routesSource).not.toContain('pricing: () => "/pricing')
		expect(routesSource).not.toContain('pricingAutomation: () => "/pricing')
	})
})
