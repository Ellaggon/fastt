import {
	normalizeTourLaunchStep,
	tourPreparationReturnHref,
	buildTourPlaybookHref,
} from "./launch-tour"
import {
	getProductVerticalEntry,
	type ProductVerticalSectionKey,
} from "@/lib/catalog/productVerticalRegistry"
import { routes } from "@/lib/routes"
import type { CompleteToPublishCheck } from "@/lib/playbook/evaluate-complete-to-publish-progress"
import { TOUR_PUBLISHING_STAGES } from "@/lib/playbook/tour-publishing-stages"

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
		playbook === COMPLETE_TO_PUBLISH_PLAYBOOK_ID ||
		playbook === "complete" ||
		(!playbook && flow === "complete")
	)
}

export function inferCompleteToPublishStepFromPath(url: URL): ProductVerticalSectionKey | null {
	if (url.pathname.endsWith("/preview")) return "preview"
	if (url.pathname.endsWith("/content")) return "content"
	if (url.pathname.endsWith("/images")) return "photos"
	if (url.pathname.endsWith("/location")) return "location"
	if (url.pathname.endsWith("/subtype")) return "subtype"
	if (url.pathname.endsWith("/rooms")) return "rooms"
	if (url.pathname.endsWith("/tickets")) return "tickets"
	if (url.pathname.endsWith("/categories")) return "categories"
	if (url.pathname.includes("/departures/")) return "departure"
	if (url.pathname.includes("/house-rules")) return "houseRules"
	if (url.pathname.includes("/rates/calendar")) return "calendar"
	if (url.pathname.match(/\/rates\/plans\/[^/]+$/)) {
		const vista = String(url.searchParams.get("vista") ?? "")
			.trim()
			.toLowerCase()
		if (vista === "price") return "rate"
		return "bookingPolicies"
	}
	if (url.pathname.includes("/rates/plans/manage")) return "rate"
	if (url.pathname.includes("/rates/")) return "bookingPolicies"
	return null
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

	const inferredStep = inferCompleteToPublishStepFromPath(url)

	const stepId = active ? (normalizeCompleteToPublishStep(explicitStep) ?? inferredStep) : null

	return {
		active,
		playbookId: active ? COMPLETE_TO_PUBLISH_PLAYBOOK_ID : null,
		stepId,
		productId,
	}
}

function lastPathBelongsToProduct(
	productId: string,
	lastPath: string | null | undefined,
	allowPreparation = false
): string | null {
	const path = String(lastPath ?? "").trim()
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) return null
	const url = new URL(path, "http://fastt.local")
	const pathProduct = url.pathname.match(/^\/product\/([^/]+)/)?.[1] ?? ""
	const queryProduct = String(url.searchParams.get("productId") ?? "").trim()
	if (
		(pathProduct && pathProduct !== productId) ||
		(queryProduct && queryProduct !== productId) ||
		(!pathProduct && !queryProduct)
	)
		return null
	if (!url.pathname.startsWith("/product/") && !url.pathname.startsWith("/rates/")) return null
	const playbook = String(url.searchParams.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	const flow = String(url.searchParams.get("flow") ?? "")
		.trim()
		.toLowerCase()
	if (
		!(allowPreparation && playbook === "launch-tour") &&
		playbook !== COMPLETE_TO_PUBLISH_PLAYBOOK_ID &&
		playbook !== "complete" &&
		flow !== "complete"
	) {
		return null
	}
	return `${url.pathname}${url.search}`
}

function inferCompleteToPublishVertical(checks: CompleteToPublishCheck[]): string | null {
	const keys = new Set(checks.map((check) => check.sectionKey))
	if (
		keys.has("tickets") ||
		keys.has("departure") ||
		keys.has("itinerary") ||
		keys.has("categories") ||
		(keys.has("photos") && keys.has("location"))
	) {
		return "tour"
	}
	if (keys.has("rooms") || keys.has("houseRules")) return "hotel"
	return null
}

function normalizeTourNavigationStep(step: string): ProductVerticalSectionKey | null {
	const raw = normalizeTourLaunchStep(step) ?? String(step ?? "").trim()
	if (raw === "create") return "content"
	if (raw === "conditions") return "bookingPolicies"
	return normalizeCompleteToPublishStep(raw)
}

/** Tour wizard order follows publishing stages, not readiness checklist order. */
export function completeToPublishNavigationOrder(
	verticalHint?: string | null
): ProductVerticalSectionKey[] {
	const entry = getProductVerticalEntry(verticalHint)
	if (entry.vertical !== "tour") {
		return entry.readiness.requiredSections.filter((section) => section !== "identity")
	}
	const steps: ProductVerticalSectionKey[] = []
	const seen = new Set<ProductVerticalSectionKey>()
	for (const stage of TOUR_PUBLISHING_STAGES) {
		for (const rawStep of stage.steps) {
			const normalized = normalizeTourNavigationStep(String(rawStep))
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			steps.push(normalized)
		}
	}
	return [...steps, "preview"]
}

export function resolveCompleteToPublishResume(
	productId: string,
	checks: CompleteToPublishCheck[],
	options?: { lastPath?: string | null; vertical?: string | null }
): { href: string; sectionKey: string | null; label: string | null } {
	const playbookResumeOrder = completeToPublishNavigationOrder(
		options?.vertical ?? inferCompleteToPublishVertical(checks)
	)
	const bySection = new Map<ProductVerticalSectionKey, CompleteToPublishCheck>()
	for (const check of checks) {
		const key =
			getProductVerticalEntry(options?.vertical ?? inferCompleteToPublishVertical(checks))
				.vertical === "tour"
				? (normalizeTourNavigationStep(check.sectionKey) ?? check.sectionKey)
				: check.sectionKey
		const existing = bySection.get(key)
		if (!existing || !check.complete) bySection.set(key, check)
	}
	const playbookSteps = playbookResumeOrder
		.map((sectionKey) => bySection.get(sectionKey))
		.filter((check): check is CompleteToPublishCheck => Boolean(check))
	const isTour =
		Boolean(options?.lastPath?.includes("tourFlowVersion=2")) ||
		getProductVerticalEntry(options?.vertical ?? inferCompleteToPublishVertical(checks))
			.vertical === "tour"
	const firstIncomplete =
		playbookSteps.find((check) => !check.complete && (!isTour || check.sectionKey !== "preview")) ??
		null

	const preview = checks.find((check) => check.sectionKey === "preview")
	let previewHref = buildCompleteToPublishHref(
		preview?.href ?? routes.productPreview(productId),
		"preview"
	)
	const savedPath = lastPathBelongsToProduct(productId, options?.lastPath, isTour)
	if (savedPath) {
		const url = new URL(savedPath, "http://fastt.local")
		const resolved = resolveCompleteToPublishPlaybookFromUrl(url)
		const savedStep =
			resolved.stepId ?? normalizeCompleteToPublishStep(url.searchParams.get("step"))
		const current = checks.find((check) => check.sectionKey === savedStep) ?? null
		// Once preparation is complete, a prior commercial step still identifies
		// the offer being prepared, even though its form no longer needs attention.
		const savedVariantId = url.searchParams.get("variantId")?.trim()
		const savedRatePlanId =
			url.searchParams.get("ratePlanId")?.trim() ||
			url.pathname.match(/^\/rates\/plans\/([^/]+)$/)?.[1]
		if (!firstIncomplete && savedVariantId && savedRatePlanId) {
			const target = new URL(previewHref, "http://fastt.local")
			target.searchParams.set("variantId", savedVariantId)
			target.searchParams.set("ratePlanId", savedRatePlanId)
			previewHref = `${target.pathname}${target.search}`
		}
		// Resume the last valid editing location; review remains available once preparation is complete.
		if (
			current &&
			((isTour && current.sectionKey === "preview") ||
				(firstIncomplete && current.sectionKey !== "preview") ||
				(!firstIncomplete && current.sectionKey === "preview"))
		) {
			// A legacy preview URL may lack selection; use the diagnosed pair only
			// when neither identifier was saved. Never combine two different offers.
			if (
				current.sectionKey === "preview" &&
				!url.searchParams.get("variantId")?.trim() &&
				!url.searchParams.get("ratePlanId")?.trim()
			) {
				const diagnosed = new URL(previewHref, "http://fastt.local")
				for (const key of ["variantId", "ratePlanId"]) {
					const value = diagnosed.searchParams.get(key)
					if (value) url.searchParams.set(key, value)
				}
			}
			return {
				href: `${url.pathname}${url.search}`,
				sectionKey: resolved.stepId,
				label: current.label,
			}
		}
	}
	const resume = firstIncomplete
	if (!resume) {
		return {
			href: previewHref,
			sectionKey: "preview",
			label: "Vista previa y publicar",
		}
	}
	return {
		href: isTour
			? buildTourPlaybookHref(resume.href, normalizeTourLaunchStep(resume.sectionKey) ?? "content")
			: buildCompleteToPublishHref(resume.href, resume.sectionKey),
		sectionKey: resume.sectionKey,
		label: resume.label,
	}
}

export function buildCompleteToPublishResumeHref(
	productId: string,
	checks: CompleteToPublishCheck[],
	options?: { lastPath?: string | null }
): string {
	return resolveCompleteToPublishResume(productId, checks, options).href
}

export function buildCompleteToPublishEntryHref(productId: string): string {
	return buildCompleteToPublishHref(routes.productPreview(productId), "preview")
}

const COMPLETE_TO_PUBLISH_STEP_ORDER: ProductVerticalSectionKey[] = [
	"content",
	"photos",
	"location",
	"subtype",
	"rooms",
	"itinerary",
	"tickets",
	"categories",
	"departure",
	"rate",
	"calendar",
	"inclusions",
	"houseRules",
	"bookingPolicies",
	"preview",
]

export function normalizeCompleteToPublishStep(
	step: string | null | undefined
): ProductVerticalSectionKey | null {
	const raw = String(step ?? "")
		.trim()
		.toLowerCase()
	if (!raw) return null
	if (raw === "images") return "photos"
	if (raw === "house-rules" || raw === "houserules") return "houseRules"
	if (raw === "booking-policies" || raw === "bookingpolicies" || raw === "conditions") {
		return "bookingPolicies"
	}
	return COMPLETE_TO_PUBLISH_STEP_ORDER.includes(raw as ProductVerticalSectionKey)
		? (raw as ProductVerticalSectionKey)
		: null
}

export function completeToPublishStepHref(
	productId: string,
	section: ProductVerticalSectionKey,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string {
	const href = unscopedCompleteToPublishStepHref(productId, section, context)
	const url = new URL(href, "http://fastt.local")
	if (context.variantId?.trim()) url.searchParams.set("variantId", context.variantId.trim())
	if (context.ratePlanId?.trim()) url.searchParams.set("ratePlanId", context.ratePlanId.trim())
	const pathWithSelection = `${url.pathname}${url.search}${url.hash}`
	return buildCompleteToPublishHref(pathWithSelection, section)
}

/** Repair tour preparation links that carry offer selection but omit playbook query params. */
export function getCompleteToPublishPlaybookRepairHref(
	url: URL,
	context: { isTour: boolean; productId: string }
): string | null {
	if (
		!context.isTour ||
		!String(context.productId ?? "").trim() ||
		url.searchParams.get("playbook") === "add-tour-option"
	)
		return null
	if (isCompleteToPublishPlaybookActive(url)) return null
	if (String(url.searchParams.get("playbook") ?? "").trim() === "launch-tour") return null

	const variantId = url.searchParams.get("variantId")?.trim() ?? ""
	const ratePlanId = url.searchParams.get("ratePlanId")?.trim() ?? ""
	if (!variantId && !ratePlanId) return null

	const step =
		normalizeCompleteToPublishStep(url.searchParams.get("step")) ??
		inferCompleteToPublishStepFromPath(url)
	if (!step) return null

	const target = new URL(
		completeToPublishStepHref(context.productId, step, { variantId, ratePlanId }),
		url.origin
	)
	const returnHref = tourPreparationReturnHref(url.searchParams.get("returnTo"), context.productId)
	if (returnHref) target.searchParams.set("returnTo", returnHref)
	const repaired = target.pathname + target.search
	const current = `${url.pathname}${url.search}`
	return repaired !== current ? repaired : null
}

function unscopedCompleteToPublishStepHref(
	productId: string,
	section: ProductVerticalSectionKey,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string {
	const variantId = String(context.variantId ?? "").trim()
	const ratePlanId = String(context.ratePlanId ?? "").trim()
	switch (section) {
		case "content":
			return `/product/${encodeURIComponent(productId)}/content`
		case "photos":
			return `/product/${encodeURIComponent(productId)}/images`
		case "location":
			return `/product/${encodeURIComponent(productId)}/location`
		case "subtype":
		case "itinerary":
		case "inclusions":
		case "services":
			return `/product/${encodeURIComponent(productId)}/subtype`
		case "tickets":
			return `/product/${encodeURIComponent(productId)}/tickets`
		case "categories":
			return `/product/${encodeURIComponent(productId)}/categories`
		case "departure":
			return variantId
				? `/product/${encodeURIComponent(productId)}/departures/${encodeURIComponent(variantId)}`
				: `/product/${encodeURIComponent(productId)}/departures/new`
		case "rate":
			return ratePlanId
				? `${routes.ratePlanDetail(ratePlanId)}?${new URLSearchParams({
						productId,
						vista: "price",
						...(variantId ? { variantId } : {}),
					}).toString()}`
				: `${routes.rates()}?${new URLSearchParams({
						productId,
						openDialog: "1",
						...(variantId ? { variantId } : {}),
					}).toString()}`
		case "calendar":
			return `${routes.calendar()}?${new URLSearchParams({
				focus: "availability",
				productId,
				...(variantId ? { variantId } : {}),
				...(ratePlanId ? { ratePlanId } : {}),
			}).toString()}`
		case "rooms":
			return routes.productRoomsForProduct(productId)
		case "houseRules":
			return `${routes.providerHouseRules()}?productId=${encodeURIComponent(productId)}`
		case "bookingPolicies":
			return ratePlanId
				? `${routes.ratePlanDetail(ratePlanId)}?${new URLSearchParams({
						vista: "conditions",
						productId,
						...(variantId ? { variantId } : {}),
						ratePlanId,
					}).toString()}`
				: `${routes.rates()}?productId=${encodeURIComponent(productId)}`
		case "preview": {
			const params = new URLSearchParams()
			if (variantId) params.set("variantId", variantId)
			if (ratePlanId) params.set("ratePlanId", ratePlanId)
			const query = params.toString()
			return `${routes.productPreview(productId)}${query ? `?${query}` : ""}`
		}
		default:
			return routes.productDetail(productId)
	}
}

function completeToPublishOrderedSteps(verticalHint?: string | null): ProductVerticalSectionKey[] {
	return completeToPublishNavigationOrder(verticalHint)
}

function adjacentCompleteToPublishStep(
	productId: string,
	currentStep: string | null | undefined,
	direction: "next" | "previous",
	verticalHint?: string | null,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): { step: ProductVerticalSectionKey; href: string } | null {
	const steps = completeToPublishOrderedSteps(verticalHint)
	const current =
		(getProductVerticalEntry(verticalHint).vertical === "tour"
			? normalizeTourNavigationStep(String(currentStep ?? ""))
			: normalizeCompleteToPublishStep(currentStep)) ??
		steps[0] ??
		null
	if (!current) return null
	const currentIndex = steps.indexOf(current)
	const start = currentIndex >= 0 ? currentIndex : 0
	const currentHref = completeToPublishStepHref(productId, current, context)

	if (direction === "next") {
		for (let index = start + 1; index < steps.length; index += 1) {
			const step = steps[index]
			const href = completeToPublishStepHref(productId, step, context)
			if (href !== currentHref) {
				return { step, href: buildCompleteToPublishHref(href, step) }
			}
		}
		return {
			step: "preview",
			href: buildCompleteToPublishHref(
				completeToPublishStepHref(productId, "preview", context),
				"preview"
			),
		}
	}

	for (let index = start - 1; index >= 0; index -= 1) {
		const step = steps[index]
		const href = completeToPublishStepHref(productId, step, context)
		if (href !== currentHref) {
			return { step, href: buildCompleteToPublishHref(href, step) }
		}
	}
	return null
}

export function completeToPublishNextHref(
	productId: string,
	currentStep: string | null | undefined,
	verticalHint?: string | null,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string {
	return (
		adjacentCompleteToPublishStep(productId, currentStep, "next", verticalHint, context)?.href ??
		buildCompleteToPublishHref(completeToPublishStepHref(productId, "preview", context), "preview")
	)
}

export function completeToPublishPreviousHref(
	productId: string,
	currentStep: string | null | undefined,
	verticalHint?: string | null,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string | null {
	return (
		adjacentCompleteToPublishStep(productId, currentStep, "previous", verticalHint, context)
			?.href ?? null
	)
}
