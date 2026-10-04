import { describe, expect, it } from "vitest"
import { readdirSync } from "node:fs"
import { enterpriseNavigation } from "@/lib/backoffice-governance"
import { providerOperationalNavigation } from "@/lib/dashboard/providerOperationalNavigation"
import {
	providerNavigationItemId,
	resolveProviderNavigationSelection,
} from "@/lib/dashboard/providerNavigationSelection"
import { resolveWorkspaceNavigationScope } from "@/lib/workspace/verticalContext"

const tours = providerOperationalNavigation("tour")!
const items = tours.flatMap((group) => group.items)

const tourNavigationCases = [
	["/dashboard", "overview"],
	["/catalog/tours", "tour-catalog"],
	["/product", "tour-catalog"],
	["/product/create", "tour-catalog"],
	["/product/p", "tour-catalog"],
	["/product/p/content", "tour-catalog"],
	["/product/p/images", "tour-catalog"],
	["/product/p/location", "tour-catalog"],
	["/product/p/categories", "tour-catalog"],
	["/product/p/subtype", "tour-catalog"],
	["/product/p/tickets", "tour-catalog"],
	["/product/p/preview", "tour-catalog"],
	["/product/p/select-offer", "tour-catalog"],
	["/product/p/departures", "tour-catalog"],
	["/product/p/departures/new", "tour-catalog"],
	["/product/p/departures/v", "tour-catalog"],
	["/product/p/private-requests", "bookings"],
	["/booking", "bookings"],
	["/booking/b", "bookings"],
	["/booking/day-of", "today"],
	["/rates/calendar", "availability"],
	["/rates/calendar/connections", "availability"],
	["/rates/multi-calendar", "availability"],
	["/rates/plans/manage", "pricing"],
	["/rates/plans/r", "pricing"],
	["/rates/pricing-jobs/j", "pricing"],
	["/financial", "finance"],
	["/financial/refunds", "finance"],
	["/provider/settings", "settings"],
	["/provider/settings/verification", "settings"],
	["/provider/settings/verification/fiscal", "settings"],
	["/provider/settings/integrations/connections/c", "settings"],
	["/provider/support", "support"],
] as const

describe("provider navigation contract", () => {
	it("covers applicable page files so a new route cannot silently lose its selection", () => {
		const paths = [
			"product",
			"booking",
			"rates",
			"financial",
			"provider/settings",
			"provider/support",
			"catalog/tours",
			"dashboard",
		]
		const files = readdirSync("src/pages", { recursive: true, encoding: "utf8" })
		for (const file of files) {
			if (
				!file.endsWith(".astro") ||
				!paths.some((root) => file.startsWith(`${root}/`) || file === `${root}.astro`)
			)
				continue
			const path =
				"/" +
				file
					.replace(/\/index\.astro$/, "")
					.replace(/\.astro$/, "")
					.replace(/\[[^\]]+\]/g, "p")
			if (/^\/product\/p\/(?:rooms|whole-home)(?:\/|$)/.test(path)) continue
			expect(
				resolveProviderNavigationSelection({ path, vertical: "tour", items }),
				file
			).not.toBeNull()
		}
	})
	it("defines nine stable tour destinations and only two headings", () => {
		expect(items.map((item) => item.id)).toEqual([
			"overview",
			"bookings",
			"today",
			"availability",
			"tour-catalog",
			"pricing",
			"finance",
			"settings",
			"support",
		])
		expect(new Set(items.map((item) => item.href)).size).toBe(9)
		expect(tours.map((group) => group.heading).filter(Boolean)).toEqual(["Operación", "Oferta"])
	})
	it.each(tourNavigationCases)("assigns %s to %s independently of URL metadata", (path, id) => {
		for (const suffix of [
			"",
			"/?ratePlanId=r&variantId=v&playbook=launch&flow=create#field",
			"?flow=complete&variantId=v&ratePlanId=r",
		]) {
			expect(
				resolveProviderNavigationSelection({ path: path + suffix, vertical: "tour", items })
			).toBe(id)
		}
	})
	it.each([
		"/booking-other",
		"/dashboard-extra",
		"/product/p/unknown",
		"/rates/calendar-extra",
		"/provider/settings-other",
		"/admin/support",
	])("does not invent ownership for %s", (path) => {
		expect(resolveProviderNavigationSelection({ path, vertical: "tour", items })).toBeNull()
	})
	it("never returns an unavailable destination and does not use labels", () => {
		expect(
			resolveProviderNavigationSelection({
				path: "/booking/day-of",
				vertical: "tour",
				items: items.filter((item) => item.id !== "today"),
			})
		).toBeNull()
		expect(
			resolveProviderNavigationSelection({
				path: "/rates/plans/r",
				vertical: "tour",
				items: items.map((item) => ({ ...item, label: "Changed" })),
			})
		).toBe("pricing")
	})
	it.each([
		["/dashboard", "overview"],
		["/product/h", "accommodations"],
		["/product/h/content", "accommodations"],
		["/product/h/rooms/new", "rooms"],
		["/rates/plans/r", "pricing"],
		["/provider/settings/verification", "settings"],
	])("preserves hotel ownership for %s", (path, id) => {
		expect(
			resolveProviderNavigationSelection({
				path,
				vertical: "hotel",
				items: providerOperationalNavigation("hotel")!.flatMap((group) => group.items),
			})
		).toBe(id)
	})
	it("keeps consolidated enterprise selection on its most specific visible entry", () => {
		const items = enterpriseNavigation.flatMap((group) =>
			group.items.map((item) => ({ ...item, id: item.id ?? providerNavigationItemId(item.href) }))
		)
		expect(resolveProviderNavigationSelection({ path: "/dashboard", vertical: null, items })).toBe(
			"overview"
		)
		expect(
			resolveProviderNavigationSelection({
				path: "/provider/settings/verification?line=tour",
				vertical: null,
				items,
			})
		).toBe("route:/provider/settings/verification")
	})
	it("uses the page's verified product over a contradictory business query", () => {
		expect(
			resolveWorkspaceNavigationScope({
				productTypes: ["hotel", "tour"],
				searchParams: new URLSearchParams("scope=hotel&productId=p"),
				verifiedProductType: "tour",
			})
		).toEqual({ vertical: "tour", productId: "p" })
		expect(
			resolveWorkspaceNavigationScope({
				productTypes: ["hotel", "tour"],
				searchParams: new URLSearchParams(),
			})
		).toEqual({ vertical: null, productId: null })
		expect(
			resolveWorkspaceNavigationScope({
				productTypes: ["hotel", "tour"],
				searchParams: new URLSearchParams("scope=tour"),
			})
		).toEqual({ vertical: "tour", productId: null })
	})
})
