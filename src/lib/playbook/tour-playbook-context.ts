import { safeProductPreviewReturn } from "@/lib/auth/returnTo"

export type TourPlaybookPart = "prepare" | "publish"
export const TOUR_FLOW_VERSION = "2"

export function tourPublicationHref(
	productId: string,
	selection: { variantId?: string | null; ratePlanId?: string | null } = {}
) {
	const params = new URLSearchParams({
		playbook: "complete-to-publish",
		step: "preview",
		flow: "complete",
		tourFlowVersion: TOUR_FLOW_VERSION,
	})
	if (selection.variantId) params.set("variantId", selection.variantId)
	if (selection.ratePlanId) params.set("ratePlanId", selection.ratePlanId)
	return `/product/${encodeURIComponent(productId)}/preview?${params}`
}

export function tourPublicationReturn(
	value: unknown,
	productId: string,
	selection: { variantId?: string | null; ratePlanId?: string | null } = {}
) {
	const path =
		typeof value === "string" && value.length <= 4096 ? safeProductPreviewReturn(value) : null
	if (!path) return null
	const url = new URL(path, "http://fastt.local")
	if (
		url.pathname !== `/product/${encodeURIComponent(productId)}/preview` ||
		url.searchParams.has("returnTo")
	)
		return null
	for (const key of ["variantId", "ratePlanId"] as const) {
		if (selection[key] && url.searchParams.get(key) && url.searchParams.get(key) !== selection[key])
			return null
	}
	return tourPublicationHref(productId, {
		variantId: selection.variantId || url.searchParams.get("variantId"),
		ratePlanId: selection.ratePlanId || url.searchParams.get("ratePlanId"),
	})
}

/** Legacy completion forms were preparation; preview and explicit review returns were publication. */
export function resolveTourPlaybookContext(url: URL, productId: string) {
	const params = url.searchParams
	const id = params.get("playbook")?.trim().toLowerCase()
	const complete =
		id === "complete-to-publish" || id === "complete" || (!id && params.get("flow") === "complete")
	if (id !== "launch-tour" && !complete) return null
	const selection = { variantId: params.get("variantId"), ratePlanId: params.get("ratePlanId") }
	const returnHref = tourPublicationReturn(params.get("returnTo"), productId, selection)
	const part: TourPlaybookPart =
		url.pathname.endsWith("/preview") ||
		(complete && (params.get("tourFlowVersion") === TOUR_FLOW_VERSION || returnHref))
			? "publish"
			: "prepare"
	const playbookId = part === "publish" ? "complete-to-publish" : "launch-tour"
	const canonical = new URL(url)
	canonical.searchParams.set("playbook", playbookId)
	canonical.searchParams.set("flow", part === "publish" ? "complete" : "create")
	canonical.searchParams.set("tourFlowVersion", TOUR_FLOW_VERSION)
	if (returnHref) canonical.searchParams.set("returnTo", returnHref)
	else canonical.searchParams.delete("returnTo")
	return { part, playbookId, returnHref, canonical } as const
}

export function tourPublicationCorrectionHref(
	href: string,
	productId: string,
	selection: { variantId?: string | null; ratePlanId?: string | null } = {}
) {
	const url = new URL(href, "http://fastt.local")
	if (
		url.pathname === `/product/${encodeURIComponent(productId)}/content` ||
		url.pathname === `/product/${encodeURIComponent(productId)}/categories`
	) {
		url.pathname = `/product/${encodeURIComponent(productId)}/presentation`
		url.searchParams.set("step", "content")
	}
	url.searchParams.set("returnTo", tourPublicationHref(productId, selection))
	if (url.pathname.startsWith("/product/") || url.pathname.startsWith("/rates/")) {
		url.searchParams.set("playbook", "complete-to-publish")
		url.searchParams.set("flow", "complete")
		url.searchParams.set("tourFlowVersion", TOUR_FLOW_VERSION)
		for (const key of ["variantId", "ratePlanId"] as const)
			if (selection[key]) url.searchParams.set(key, selection[key]!)
	}
	return url.pathname + url.search + url.hash
}
