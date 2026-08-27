import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("calendar progressive navigation contract", () => {
	it("keeps the workspace shell visible with route-specific delayed skeletons", () => {
		const layout = read("src/layouts/WorkspaceLayout.astro")
		const pending = read("src/components/dashboard/WorkspaceNavigationPending.astro")

		expect(layout).toContain("WorkspaceNavigationPending")
		expect(layout).toContain("data-workspace-main")
		expect(pending).toContain('document.addEventListener("astro:before-preparation"')
		expect(pending).toContain('document.addEventListener("astro:after-swap"')
		expect(pending).toContain('document.addEventListener("astro:page-load"')
		expect(pending).toContain("data-pending-calendar")
		expect(pending).toContain("data-pending-rates")
		expect(pending).toContain("}, 120)")
	})

	it("does not compete with the initial surface by eagerly loading iCal connections", () => {
		const subnav = read("src/components/rates/CalendarSubnav.astro")

		expect(subnav).toContain('type="button"')
		expect(subnav).toContain("history.replaceState")
		expect(subnav).not.toContain('data-astro-prefetch="viewport"')
		expect(subnav).not.toContain("<a")
	})

	it("prefetches Calendar from Rates only after explicit pointer intent", () => {
		const manage = read("src/pages/rates/plans/manage.astro")
		const actions = read("src/components/rates/RatePlanActionMenu.astro")

		expect(manage).toMatch(
			/<Button[\s\S]*?href=\{routes\.calendar\(\)\}[\s\S]*?data-astro-prefetch="hover"[\s\S]*?>[\s\S]*?Calendario/
		)
		expect(actions).toMatch(
			/href=\{`\$\{routes\.calendar\(\)\}[\s\S]*?data-astro-prefetch="hover"[\s\S]*?Calendario/
		)
		expect(manage).not.toContain('data-astro-prefetch="viewport"')
		expect(actions).not.toContain('data-astro-prefetch="viewport"')
	})

	it("resolves calendar auth and provider context once through Astro locals", () => {
		const page = read("src/pages/rates/calendar.astro")
		const multiPage = read("src/pages/rates/multi-calendar.astro")

		for (const source of [page, multiPage]) {
			expect(source).toContain("Astro.locals.getWorkspaceContext()")
			expect(source).not.toContain("requireProvider(Astro.request)")
			expect(source).not.toContain("getProviderSidebarData(")
		}
		expect(page).toContain('timing.time("sidebar"')
		expect(page.match(/workspaceContext\.sidebarDataPromise/g)).toHaveLength(1)
		expect(multiPage).toContain("workspaceContext.sidebarDataPromise")
		expect(page).toContain("loadProviderRatePlansReadModel")
		expect(page).toContain("needsGuidedContext")
	})

	it("streams an Astro shell and lets the React island fetch the heavy surface", () => {
		const page = read("src/pages/rates/calendar.astro")
		const skeleton = read("src/components/rates/CalendarWorkspaceSkeleton.astro")
		const single = read("src/components/rates/SingleCalendarWorkspace.tsx")

		expect(page).toContain('client:only="react"')
		expect(page).toContain("CalendarWorkspaceSkeleton")
		expect(page).not.toContain("loadSingleCalendarSurface(")
		expect(page).not.toContain("initialSurface=")
		expect(skeleton).toContain('aria-busy="true"')
		expect(skeleton).not.toContain("aspect-square")
		expect(skeleton).toContain("min-h-20")
		expect(single).not.toContain("aspect-square min-h-16")
		expect(single).toContain("/api/rates/calendar?")
	})

	it("uses a neutral, calendar-shaped navigation placeholder", () => {
		const pending = read("src/components/dashboard/WorkspaceNavigationPending.astro")

		expect(pending).toContain("workspace-skeleton-calendar-panel")
		expect(pending).toContain("workspace-skeleton-weekday")
		expect(pending).toContain("workspace-skeleton-date")
		expect(pending).toContain("border-radius: 8px")
		expect(pending).not.toContain("#38bdf8")
		expect(pending).not.toContain("#0f172a")
	})

	it("shares provider-scoped rate plan reads without invoking an API handler", () => {
		const service = read("src/lib/rates/loadRatePlansReadModel.ts")
		const endpoint = read("src/pages/api/rates/calendar.ts")

		expect(service).toContain("loadProviderRatePlansReadModel")
		expect(service).toContain("providerId: string")
		expect(service).toContain("buildProviderRatePlansSurface")
		expect(service).not.toContain('from "@/pages/api/rates/plans"')
		expect(endpoint.match(/requireProvider\(/g)).toHaveLength(1)
		expect(endpoint).toContain("loadProviderRatePlansReadModel")
	})

	it("keeps bounded calendar surfaces across Astro island remounts", () => {
		const cache = read("src/lib/rates/calendarSurfaceClientCache.ts")
		const single = read("src/components/rates/SingleCalendarWorkspace.tsx")
		const multi = read("src/components/rates/MultiCalendarWorkspace.tsx")

		expect(cache).toContain("createBoundedClientCache")
		expect(cache).toContain("while (entries.size > limit)")
		expect(single).toContain("surfaceCache.get(")
		expect(single).toContain("surfaceCache.set(")
		expect(single).toContain("new AbortController()")
		expect(single).toContain("requestIdleCallback")
		expect(single).toContain("prefetchCalendarSurface")
		expect(single).toContain("surfaceCache.clear()")
		expect(multi).toContain("workspaceCache.get(")
		expect(multi).toContain("workspaceCache.set(")
	})

	it("starts independent calendar and iCal reads concurrently", () => {
		const calendars = read("src/lib/rates/calendarSurfaces.ts")
		const single = read("src/lib/rates/singleCalendarSurface.ts")

		expect(calendars).toContain(
			"const [pricingBundle, restrictionRows, availabilityRows, searchRows] = await Promise.all(["
		)
		for (const metric of ["pricing", "inventory", "restrictions", "searchFreshness"]) {
			expect(calendars).toContain(`measured("${metric}"`)
		}
		expect(calendars).toContain(
			"const [vocabulary, inventoryRows, restrictionRows, searchRows] = await Promise.all(["
		)
		expect(calendars).not.toContain("const vocabulary = await resolveVocabulary(rows)")
		expect(single).toContain("const [pricing, externalCalendarOverlay] = await Promise.all([")
		expect(single).toContain("buildPricingCalendarSurface(pricingInput)")
		expect(single).toContain("overlayPromise")
	})

	it("shares a short-lived server calendar cache behind the progressive API", () => {
		const keys = read("src/lib/cache/cacheKeys.ts")
		const single = read("src/lib/rates/singleCalendarSurface.ts")
		const page = read("src/pages/rates/calendar.astro")
		const endpoint = read("src/pages/api/rates/calendar.ts")
		const invalidation = read("src/lib/cache/invalidation.ts")
		const restrictions = read("src/lib/rates/restrictionsSurface.ts")

		expect(keys).toContain("calendarSurface(")
		expect(keys).toContain("calendarSurface: 15")
		expect(single).toContain("export async function loadSingleCalendarSurface")
		expect(single).toContain("readThrough(key, cacheTtls.calendarSurface")
		expect(page).not.toContain("loadSingleCalendarSurface({")
		expect(endpoint).toContain("loadSingleCalendarSurface({")
		expect(invalidation).toContain("cacheKeys.calendarSurfacePrefix(providerId)")
		expect(invalidation).toContain("cacheKeys.calendarSurfacePrefix(id)")
		expect(restrictions).toContain("invalidateCalendarSurface(params.providerId, params.reason)")
	})

	it("publishes stable timing segments across the SSR shell and calendar API", () => {
		const page = read("src/pages/rates/calendar.astro")
		const endpoint = read("src/pages/api/rates/calendar.ts")
		const calendar = read("src/lib/rates/calendarSurfaces.ts")
		const single = read("src/lib/rates/singleCalendarSurface.ts")

		for (const metric of [
			"authProvider",
			"ratePlans",
			"pricing",
			"inventory",
			"restrictions",
			"searchFreshness",
			"ical",
			"sidebar",
			"total",
		]) {
			expect(`${page}\n${endpoint}\n${calendar}\n${single}`).toContain(`"${metric}"`)
		}
		expect(page).toContain('"deferred_calendar_api"')
		expect(page).toContain("timing.setHeader(Astro.response.headers)")
		expect(endpoint).toContain('"resolved_by_ssr_shell"')
		expect(endpoint).toContain("timing.headers(headers)")
		expect(single).toContain('"calendar_surface_cache_hit"')
	})
})
