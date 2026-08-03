import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("provider rate plans performance contract", () => {
	it("shares one provider surface between SSR and the authenticated API", () => {
		const page = read("src/pages/rates/plans/manage.astro")
		const endpoint = read("src/pages/api/rates/plans.ts")
		const surface = read("src/lib/rates/providerRatePlansSurface.ts")

		expect(page).toContain("buildProviderRatePlansSurface")
		expect(page).toContain("workspaceContext.provider.providerId")
		expect(page).not.toContain("loadRatePlansReadModel")
		expect(endpoint).toContain("requireProvider")
		expect(endpoint).toContain("buildProviderRatePlansSurface")
		expect(surface).not.toContain("getUserFromRequest")
		expect(surface).not.toContain("getProviderIdFromRequest")
		expect(surface).toContain("readThrough")
		expect(surface).toContain("cacheTtls.providerRatePlansSurface")
	})

	it("loads recent changes after the rates shell", () => {
		const page = read("src/pages/rates/plans/manage.astro")
		const component = read("src/components/rates/RatePlanRecentChanges.astro")
		const endpoint = read("src/pages/api/rates/plans/history.ts")

		expect(page).toContain("RatePlanRecentChanges")
		expect(page).not.toContain("loadRatesContextualHistory")
		expect(component).toContain("requestIdleCallback")
		expect(component).toContain('document.addEventListener("astro:page-load"')
		expect(component).toContain("fetch(endpoint")
		expect(endpoint).toContain("requireProvider")
		expect(endpoint).toContain("loadRatesContextualHistory")
		expect(endpoint).toContain("buildProviderRatePlansSurface")
	})

	it("invalidates the rates surface from operational ownership", () => {
		const keys = read("src/lib/cache/cacheKeys.ts")
		const invalidation = read("src/lib/cache/invalidation.ts")

		expect(keys).toContain("providerRatePlansSurfacePrefix")
		expect(keys).toContain("providerRatePlansSurface: 20")
		expect(keys).toContain("providerRatePlanVariants: 30")
		expect(invalidation).toContain("invalidateRatePlanSurfacesByOwnership")
		expect(invalidation).toContain("variantId")
		expect(invalidation).toContain("ratePlanIds")
	})

	it("caches provider variant choices and invalidates them with operational ownership", () => {
		const variants = read("src/lib/rates/loadProviderRatePlanVariants.ts")
		const invalidation = read("src/lib/cache/invalidation.ts")

		expect(variants).toContain("readThrough(")
		expect(variants).toContain("cacheKeys.providerRatePlanVariants")
		expect(variants).toContain("cacheTtls.providerRatePlanVariants")
		expect(invalidation).toContain("cacheKeys.providerRatePlanVariants(providerId)")
		expect(invalidation).toContain(
			"invalidateRatePlanSurfacesByOwnership({ variantId, productId })"
		)
	})

	it("renders one responsive representation per rate plan with a 150 KB budget", () => {
		const page = read("src/pages/rates/plans/manage.astro")
		const table = read("src/components/rates/RatePlanResponsiveTable.astro")
		const controller = read("src/lib/rates/ratePlanTabsClient.ts")
		const budget = read("scripts/perf/html-budget.mjs")

		expect(page).toContain("RatePlanResponsiveTable")
		expect(page).not.toContain("data-rate-plan-mobile-table")
		expect(page).not.toContain("data-rate-plan-desktop-table")
		expect(table.match(/<RatePlanActionMenu/g)).toHaveLength(1)
		expect(table.match(/data-rate-plan-row/g)).toHaveLength(1)
		expect(table).toContain("rate-plan-secondary-group")
		expect(controller).toContain("data-rate-plan-mobile-toggle")
		expect(budget).toContain('{ path: "/rates/plans/manage", maxBytes: 150_000 }')
	})

	it("publishes segmented Server-Timing for the rates page and deferred history", () => {
		const page = read("src/pages/rates/plans/manage.astro")
		const surface = read("src/lib/rates/providerRatePlansSurface.ts")
		const history = read("src/pages/api/rates/plans/history.ts")

		for (const metric of ["authProvider", "variants", "sidebar", "history", "total"]) {
			expect(page).toContain(`\"${metric}\"`)
		}
		for (const metric of ["ratePlansBase", "pricing", "inventory"]) {
			expect(surface).toContain(`\"${metric}\"`)
		}
		expect(surface).toContain('"ratePlansBase", performance.now() - surfaceStartedAt')
		expect(surface).toContain('"pricing", 0, "surface_cache_hit"')
		expect(surface).toContain('"inventory", 0, "surface_cache_hit"')
		expect(page).toContain('timing.add("history", 0, "deferred_endpoint")')
		expect(page).toContain("timing.setHeader(Astro.response.headers)")
		expect(history).toContain('timing.time("history"')
		expect(history).toContain("timing.headers(")
	})

	it("memoizes workspace auth and sidebar once per request", () => {
		const middleware = read("src/middleware.ts")
		const layout = read("src/layouts/WorkspaceLayout.astro")
		const sidebar = read("src/components/dashboard/DashboardSidebar.astro")
		const topbar = read("src/components/dashboard/DashboardTopBar.astro")

		expect(middleware).toContain("workspaceContextPromise ??=")
		expect(layout.match(/getWorkspaceContext\(\)/g)).toHaveLength(1)
		expect(layout.match(/workspaceContext=\{workspaceContext\}/g)).toHaveLength(3)
		expect(sidebar).not.toContain("getUserFromRequest")
		expect(sidebar).not.toContain("getProviderSidebarData")
		expect(topbar).not.toContain("getUserFromRequest")
		expect(topbar).not.toContain("getProviderSidebarData")
	})

	it("keeps view tabs local and idempotent across Astro transitions", () => {
		const controller = read("src/lib/rates/ratePlanTabsClient.ts")

		expect(controller).toContain("if (installed) return")
		expect(controller).toContain('document.addEventListener("astro:page-load"')
		expect(controller).toContain("{ capture: true }")
		expect(controller).toContain("window.history.pushState")
		expect(controller).not.toContain("fetch(")
	})
})
