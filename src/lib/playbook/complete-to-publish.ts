import type { ProductVerticalSectionKey } from "@/lib/catalog/productVerticalRegistry"
import { routes } from "@/lib/routes"
import type { CompleteToPublishCheck } from "@/lib/playbook/evaluate-complete-to-publish-progress"

export const COMPLETE_TO_PUBLISH_PLAYBOOK_ID = "complete-to-publish" as const

export const COMPLETE_TO_PUBLISH_PLAYBOOK_TITLE = "Completar preparación"

export function buildCompleteToPublishHref(
	path: string,
	step: ProductVerticalSectionKey | string
): string {
	const [basePath, hash = ""] = path.split("#")
	const [pathname, existingQuery = ""] = basePath.split("?")
	const params = new URLSearchParams(existingQuery)
	params.set("playbook", COMPLETE_TO_PUBLISH_PLAYBOOK_ID)
	params.set("step", step)
	params.set("flow", "complete")
	const query = params.toString()
	return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`
}

export function isCompleteToPublishPlaybookActive(url: URL): boolean {
	const playbook = String(url.searchParams.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	const flow = String(url.searchParams.get("flow") ?? "")
		.trim()
		.toLowerCase()
	return (
		playbook === COMPLETE_TO_PUBLISH_PLAYBOOK_ID || playbook === "complete" || flow === "complete"
	)
}

export function resolveCompleteToPublishPlaybookFromUrl(url: URL): {
	active: boolean
	playbookId: typeof COMPLETE_TO_PUBLISH_PLAYBOOK_ID | null
	stepId: ProductVerticalSectionKey | null
	productId: string
} {
	const active = isCompleteToPublishPlaybookActive(url)
	const explicitStep = String(
		url.searchParams.get("step") ?? ""
	).trim() as ProductVerticalSectionKey
	const pathProductMatch = url.pathname.match(/^\/product\/([^/]+)/)
	const productId =
		String(url.searchParams.get("productId") ?? "").trim() || (pathProductMatch?.[1] ?? "")

	let inferredStep: ProductVerticalSectionKey | null = null
	if (url.pathname.endsWith("/preview")) inferredStep = "preview"
	else if (url.pathname.endsWith("/content")) inferredStep = "content"
	else if (url.pathname.endsWith("/images")) inferredStep = "photos"
	else if (url.pathname.endsWith("/location")) inferredStep = "location"
	else if (url.pathname.endsWith("/subtype")) inferredStep = "subtype"
	else if (url.pathname.endsWith("/rooms")) inferredStep = "rooms"
	else if (url.pathname.includes("/house-rules")) inferredStep = "houseRules"
	else if (url.pathname.includes("/rates/")) inferredStep = "bookingPolicies"

	const stepId = active ? explicitStep || inferredStep : null

	return {
		active,
		playbookId: active ? COMPLETE_TO_PUBLISH_PLAYBOOK_ID : null,
		stepId,
		productId,
	}
}

export function buildCompleteToPublishResumeHref(
	productId: string,
	checks: CompleteToPublishCheck[]
): string {
	const blocker = checks.find((check) => !check.complete && check.sectionKey !== "preview")
	if (!blocker) {
		return buildCompleteToPublishHref(routes.productPreview(productId), "preview")
	}
	return buildCompleteToPublishHref(blocker.href, blocker.sectionKey)
}

export function buildCompleteToPublishEntryHref(productId: string): string {
	return buildCompleteToPublishHref(routes.productPreview(productId), "preview")
}
