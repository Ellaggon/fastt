import type { ActiveWorkspaceVertical } from "@/lib/workspace/verticalContext"
import {
	providerOperationalNavigation,
	type ProviderNavigationItemId,
} from "./providerOperationalNavigation"

type NavigationDestination = { id: ProviderNavigationItemId; href: string }

function pathname(value: string) {
	return new URL(value, "https://fastt.local").pathname.replace(/\/+$/, "") || "/"
}

const identityByHref = new Map(
	(providerOperationalNavigation("tour") ?? []).flatMap((group) =>
		group.items.map((item) => [pathname(item.href), item.id] as const)
	)
)

/** Adapter for the existing enterprise menu; labels never define identity. */
export function providerNavigationItemId(href: string): ProviderNavigationItemId {
	const path = pathname(href)
	return identityByHref.get(path) ?? `route:${path}`
}

const tourRoutes: readonly [RegExp, ProviderNavigationItemId][] = [
	[/^\/dashboard$/, "overview"],
	[/^\/booking\/day-of$/, "today"],
	[/^\/booking(?:\/[^/]+)?$/, "bookings"],
	[/^\/product\/[^/]+\/private-requests$/, "bookings"],
	[/^\/rates\/calendar(?:\/connections)?$/, "availability"],
	[/^\/rates\/multi-calendar$/, "availability"],
	[/^\/rates\/plans\/(?:manage|[^/]+)$/, "pricing"],
	[/^\/rates\/pricing-jobs\/[^/]+$/, "pricing"],
	[/^\/catalog\/tours$/, "tour-catalog"],
	[/^\/product(?:\/create|\/[^/]+)?$/, "tour-catalog"],
	[
		/^\/product\/[^/]+\/(?:content|images|location|categories|subtype|tickets|preview|select-offer)$/,
		"tour-catalog",
	],
	[/^\/product\/[^/]+\/departures(?:\/[^/]+)?$/, "tour-catalog"],
	[/^\/financial(?:\/.*)?$/, "finance"],
	[/^\/provider\/settings(?:\/.*)?$/, "settings"],
	[/^\/provider\/support(?:\/.*)?$/, "support"],
]

/** A page belongs to exactly one visible destination, independently of its query or origin. */
export function resolveProviderNavigationSelection(input: {
	path: string
	vertical: ActiveWorkspaceVertical | null
	items: readonly NavigationDestination[]
}): ProviderNavigationItemId | null {
	const path = pathname(input.path)
	if (input.vertical === "tour") {
		const id = tourRoutes.find(([pattern]) => pattern.test(path))?.[1]
		return id && input.items.some((item) => item.id === id) ? id : null
	}
	// Preserve hotel profile/room ownership with the smaller operational menu.
	if (input.vertical === "hotel" && /^\/product\/[^/]+(?:\/.*)?$/.test(path)) {
		const exact = input.items.find((item) => pathname(item.href) === path)
		if (exact) return exact.id
		const id = /^\/product\/[^/]+\/rooms(?:\/.*)?$/.test(path) ? "rooms" : "accommodations"
		return input.items.some((item) => item.id === id) ? id : null
	}
	if (input.vertical === "hotel" && /^\/catalog\/accommodations(?:\/.*)?$/.test(path)) {
		return input.items.some((item) => item.id === "accommodations") ? "accommodations" : null
	}
	if (/^\/rates\/(?:plans\/[^/]+|pricing-jobs\/[^/]+)$/.test(path)) {
		return input.items.some((item) => item.id === "pricing") ? "pricing" : null
	}
	const matches = input.items.filter((item) => {
		const destination = pathname(item.href)
		return path === destination || path.startsWith(`${destination}/`)
	})
	return matches.sort((a, b) => pathname(b.href).length - pathname(a.href).length)[0]?.id ?? null
}
