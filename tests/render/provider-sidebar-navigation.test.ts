import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import Sidebar from "@/components/dashboard/DashboardSidebar.astro"
import type { WorkspaceShellContext } from "@/lib/dashboard/workspaceRequestContext"

function context(productTypes: string[]): WorkspaceShellContext {
	return {
		provider: null,
		user: null,
		disclosureMode: "small-provider",
		sidebarData: {
			productTypes,
			summaries: {},
			primaryAccommodationHref: "/product/h",
			primaryAccommodationRoomsHref: "/product/h/rooms",
			primaryAccommodationHouseRulesHref: "/provider/house-rules?productId=h",
		},
	} as WorkspaceShellContext
}

async function render(
	path: string,
	productTypes = ["tour"],
	vertical: "tour" | "hotel" | null = null
) {
	const container = await AstroContainer.create()
	return container.renderToString(Sidebar, {
		request: new Request("https://fastt.test" + path),
		props: {
			pathname: path.split("?")[0],
			currentPath: path,
			workspaceContext: context(productTypes),
			workspaceScope: { vertical, productId: null },
		},
	})
}

function activeIds(html: string) {
	return (html.match(/<a\b[^>]*data-navigation-id[^>]*>/g) ?? [])
		.filter((tag) => tag.includes('aria-current="page"'))
		.map((tag) => tag.match(/data-navigation-id="([^"]+)"/)![1])
}

describe("rendered provider sidebar", () => {
	it.each([
		["/dashboard", "overview"],
		["/booking/day-of", "today"],
		["/booking/b", "bookings"],
		["/product/p/private-requests", "bookings"],
		["/product/p/departures/v", "tour-catalog"],
		["/product/p/preview?variantId=v&ratePlanId=r", "tour-catalog"],
		["/rates/calendar?productId=p&variantId=v", "availability"],
		["/rates/plans/r?playbook=launch&flow=create", "pricing"],
		["/provider/settings/verification?line=tour&tab=fiscal", "settings"],
		["/financial/refunds", "finance"],
		["/provider/support", "support"],
	])("renders exactly one active visible destination for %s", async (path, id) => {
		expect(activeIds(await render(path))).toEqual([id])
	})
	it("renders only the two agreed headings without empty headings", async () => {
		const html = await render("/catalog/tours")
		expect(html).toContain("Operación")
		expect(html).toContain("Oferta")
		expect(html.match(/<p\b/g)).toHaveLength(2)
		expect(html.match(/data-navigation-id=/g)).toHaveLength(9)
		expect(html).toContain("Precios y condiciones")
		expect(html).toContain("Salidas de hoy")
	})
	it("preserves hotel destinations and does not highlight dashboard aliases together", async () => {
		const html = await render("/product/h/rooms/new", ["hotel"])
		expect(activeIds(html)).toEqual(["rooms"])
		expect(html).toContain('href="/product/h/rooms"')
		expect(activeIds(await render("/dashboard", ["hotel"]))).toEqual(["overview"])
	})
	it("supports independent mixed-provider and consolidated menus", async () => {
		expect(activeIds(await render("/rates/plans/r", ["tour", "hotel"], "tour"))).toEqual([
			"pricing",
		])
		expect(activeIds(await render("/product/h/rooms", ["tour", "hotel"], "hotel"))).toEqual([
			"rooms",
		])
		expect(activeIds(await render("/provider/settings/verification", ["tour", "hotel"]))).toEqual([
			"route:/provider/settings/verification",
		])
	})
	it("does not conceal an unclassified route behind a default active link", async () => {
		expect(activeIds(await render("/product/p/unknown"))).toEqual([])
	})
})
