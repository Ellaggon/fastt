import {
	resolveTourPlaybookContext,
	tourPublicationHref,
	tourPublicationReturn,
} from "./tour-playbook-context"
export const LAUNCH_TOUR_PLAYBOOK_ID = "launch-tour" as const
export const LAUNCH_TOUR_PLAYBOOK_TITLE = "Preparar tour"

export type TourLaunchStepId =
	| "create"
	| "content"
	| "location"
	| "images"
	| "subtype"
	| "tickets"
	| "categories"
	| "departure"
	| "rate"
	| "conditions"
	| "calendar"
	| "preview"

export type TourLaunchContext = {
	productId: string
	variantId?: string
	ratePlanId?: string
}

export type TourLaunchStepDefinition = {
	id: TourLaunchStepId
	label: string
	guestImpact: string
	buildHref: (context: TourLaunchContext) => string
}

/** Shared order for creation, continuation and preparation presentation. */
export const TOUR_PREPARATION_STAGES = [
	{
		id: "presentation",
		label: "Presenta tu experiencia",
		steps: ["create", "content", "categories"],
		requirements: ["presentation", "activities"],
	},
	{
		id: "logistics",
		label: "Recorrido y logística",
		steps: ["location", "subtype"],
		requirements: ["logistics"],
	},
	{ id: "photos", label: "Fotos", steps: ["images"], requirements: ["photos"] },
	{
		id: "offer",
		label: "Primera opción, precio y condiciones",
		steps: ["tickets", "departure", "rate", "conditions"],
		requirements: ["participants", "option_profile", "group_capacity", "price", "conditions"],
	},
	{
		id: "calendar",
		label: "Fechas y cupos",
		steps: ["calendar"],
		requirements: ["calendar_configuration"],
	},
] as const

export function normalizeTourLaunchStep(step: string | null | undefined): TourLaunchStepId | null {
	const raw = String(step ?? "").trim()
	const aliases: Record<string, TourLaunchStepId> = {
		photos: "images",
		bookingPolicies: "conditions",
		itinerary: "subtype",
		inclusions: "subtype",
		services: "subtype",
		identity: "create",
	}
	if (aliases[raw]) return aliases[raw]
	return [...TOUR_PREPARATION_STAGES.flatMap((stage) => [...stage.steps]), "preview"].includes(raw)
		? (raw as TourLaunchStepId)
		: null
}

const TOUR_LAUNCH_STEP_DEFINITIONS: TourLaunchStepDefinition[] = [
	{
		id: "create",
		label: "Crear tour",
		guestImpact: "La identidad de la experiencia que venderás.",
		buildHref: () => buildTourPlaybookHref("/product/create", "create"),
	},
	{
		id: "content",
		label: "Descripción",
		guestImpact: "Lo que verá el viajero antes de reservar.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/content`, "content"),
	},
	{
		id: "location",
		label: "Destino y encuentro",
		guestImpact: "Dónde se descubre la experiencia y cómo se identifica su punto de inicio.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/location`, "location"),
	},
	{
		id: "images",
		label: "Fotos",
		guestImpact: "Imágenes que generan confianza al reservar.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/images`, "images"),
	},
	{
		id: "subtype",
		label: "Itinerario y detalles",
		guestImpact: "Duración, dificultad e itinerario de la experiencia.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/subtype`, "subtype"),
	},
	{
		id: "tickets",
		label: "Participantes",
		guestImpact: "Quién puede reservar y qué edades admite cada tipo de participante.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/tickets`, "tickets"),
	},
	{
		id: "categories",
		label: "Categorías de búsqueda",
		guestImpact: "Cómo encontrarán los viajeros esta experiencia en el catálogo.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/categories`, "categories"),
	},
	{
		id: "departure",
		label: "Perfil de la opción",
		guestImpact: "Fecha, hora, cupo e idioma disponibles para reservar.",
		buildHref: ({ productId, variantId }) =>
			buildTourPlaybookHref(
				variantId
					? `/product/${encodeURIComponent(productId)}/departures/${encodeURIComponent(variantId)}`
					: `/product/${encodeURIComponent(productId)}/departures/new`,
				"departure"
			),
	},
	{
		id: "rate",
		label: "Precio",
		guestImpact: "El precio de venta de la salida.",
		buildHref: ({ productId, variantId, ratePlanId }) => {
			if (ratePlanId)
				return buildTourPlaybookHref(
					`/rates/plans/${encodeURIComponent(ratePlanId)}?${new URLSearchParams({ productId, vista: "price", ...(variantId ? { variantId } : {}), ratePlanId })}`,
					"rate"
				)
			const params = new URLSearchParams({ productId, openDialog: "1" })
			if (variantId) params.set("variantId", variantId)
			return buildTourPlaybookHref(`/rates/plans/manage?${params}`, "rate")
		},
	},
	{
		id: "conditions",
		label: "Condiciones y preguntas",
		guestImpact: "Cancelación, confirmación y datos necesarios para operar la reserva.",
		buildHref: ({ productId, variantId, ratePlanId }) => {
			if (ratePlanId) {
				const params = new URLSearchParams({
					vista: "conditions",
					productId,
					ratePlanId,
				})
				if (variantId) params.set("variantId", variantId)
				return buildTourPlaybookHref(
					`/rates/plans/${encodeURIComponent(ratePlanId)}?${params.toString()}`,
					"conditions"
				)
			}
			const params = new URLSearchParams({ productId, openDialog: "1" })
			if (variantId) params.set("variantId", variantId)
			return buildTourPlaybookHref(`/rates/plans/manage?${params.toString()}`, "conditions")
		},
	},
	{
		id: "calendar",
		label: "Disponibilidad",
		guestImpact: "El cupo que podrán reservar los viajeros.",
		buildHref: ({ productId, variantId, ratePlanId }) => {
			const params = new URLSearchParams({ focus: "availability", productId })
			if (variantId) params.set("variantId", variantId)
			if (ratePlanId) params.set("ratePlanId", ratePlanId)
			return buildTourPlaybookHref(`/rates/calendar?${params}`, "calendar")
		},
	},
	{
		id: "preview",
		label: "Revisar y publicar",
		guestImpact: "Revisa la oferta antes de recibir reservas.",
		buildHref: ({ productId, variantId, ratePlanId }) =>
			buildTourPlaybookHref(buildTourReviewHref(productId, { variantId, ratePlanId }), "preview"),
	},
]

export const TOUR_LAUNCH_STEPS: TourLaunchStepDefinition[] = TOUR_LAUNCH_STEP_DEFINITIONS.slice()
	.sort((a, b) => {
		const order = [...TOUR_PREPARATION_STAGES.flatMap((stage) => [...stage.steps]), "preview"]
		return order.indexOf(a.id) - order.indexOf(b.id)
	})
	.map((step) => ({
		...step,
		buildHref: (context) =>
			step.id === "create"
				? step.buildHref(context)
				: withTourOfferSelection(step.buildHref(context), context),
	}))

export function withTourOfferSelection(
	path: string,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string {
	const [pathname, existingQuery = ""] = path.split("?")
	const params = new URLSearchParams(existingQuery)
	const variantId = String(context.variantId ?? "").trim()
	const ratePlanId = String(context.ratePlanId ?? "").trim()
	if (variantId) params.set("variantId", variantId)
	else params.delete("variantId")
	if (ratePlanId) params.set("ratePlanId", ratePlanId)
	else params.delete("ratePlanId")
	const query = params.toString()
	return `${pathname}${query ? `?${query}` : ""}`
}

export function buildTourReviewHref(
	productId: string,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string {
	return tourPublicationHref(productId, context)
}

export function buildTourProviderPreviewHref(
	productId: string,
	context: { variantId?: string | null; ratePlanId?: string | null } = {}
): string {
	return withTourOfferSelection(`/tours/${encodeURIComponent(productId)}?preview=provider`, context)
}

export function buildTourPlaybookHref(path: string, step: TourLaunchStepId): string {
	const [basePath, existingQuery = ""] = path.split("?")
	const params = new URLSearchParams(existingQuery)
	params.set("playbook", step === "preview" ? "complete-to-publish" : LAUNCH_TOUR_PLAYBOOK_ID)
	params.set("step", step)
	params.set("flow", step === "preview" ? "complete" : "create")
	params.set("tourFlowVersion", "2")
	return `${basePath}?${params}`
}

export function getTourLaunchStepById(
	stepId: TourLaunchStepId | string | null | undefined
): TourLaunchStepDefinition | null {
	return TOUR_LAUNCH_STEPS.find((step) => step.id === normalizeTourLaunchStep(stepId)) ?? null
}

export function getNextTourLaunchStep(
	currentStepId: TourLaunchStepId | string | null | undefined
): TourLaunchStepDefinition | null {
	const index = TOUR_LAUNCH_STEPS.findIndex(
		(step) => step.id === normalizeTourLaunchStep(currentStepId)
	)
	if (index < 0 || index >= TOUR_LAUNCH_STEPS.length - 1) return null
	return TOUR_LAUNCH_STEPS[index + 1] ?? null
}

export function getPreviousTourLaunchStep(
	currentStepId: TourLaunchStepId | string | null | undefined
): TourLaunchStepDefinition | null {
	const index = TOUR_LAUNCH_STEPS.findIndex(
		(step) => step.id === normalizeTourLaunchStep(currentStepId)
	)
	if (index <= 0) return null
	return TOUR_LAUNCH_STEPS[index - 1] ?? null
}

export function inferTourLaunchStepFromPathname(pathname: string): TourLaunchStepId | null {
	if (pathname === "/product/create") return "create"
	if (pathname.endsWith("/content")) return "content"
	if (pathname.endsWith("/location")) return "location"
	if (pathname.endsWith("/images")) return "images"
	if (pathname.endsWith("/subtype")) return "subtype"
	if (pathname.endsWith("/tickets")) return "tickets"
	if (pathname.endsWith("/categories")) return "categories"
	if (pathname.endsWith("/departures/new")) return "departure"
	if (pathname.includes("/rates/plans/manage")) return "rate"
	if (pathname.match(/\/rates\/plans\/[^/]+$/)) return "conditions"
	if (pathname.includes("/rates/calendar")) return "calendar"
	if (pathname.endsWith("/preview")) return "preview"
	return null
}

export function resolveTourLaunchStepFromUrl(
	url: URL,
	fallback: TourLaunchStepId
): TourLaunchStepId {
	const requested = String(url.searchParams.get("step") ?? "").trim()
	return (
		getTourLaunchStepById(requested)?.id ??
		inferTourLaunchStepFromPathname(url.pathname) ??
		fallback
	)
}

type TourSharedRateContext = {
	isTour: boolean
	step: Extract<TourLaunchStepId, "rate" | "conditions" | "calendar" | "preview">
	productId: string
	variantId?: string
	ratePlanId?: string
}

/**
 * Canonicalize guided entries to a shared rate page from trusted product context.
 * URL parameters express navigation intent; they never decide the business line.
 */
export function getTourSharedRateCanonicalHref(
	url: URL,
	context: TourSharedRateContext
): string | null {
	if (!context.isTour) return null

	const playbook = String(url.searchParams.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	const flow = String(url.searchParams.get("flow") ?? "")
		.trim()
		.toLowerCase()
	const isCompletePlaybook =
		playbook === "complete-to-publish" ||
		playbook === "complete" ||
		(!playbook && flow === "complete")
	const isTourPlaybook = playbook === LAUNCH_TOUR_PLAYBOOK_ID
	const hasAccommodationIntent =
		playbook === "launch" ||
		playbook === "launch-accommodation" ||
		playbook === "add-room" ||
		flow === "create" ||
		flow === "add-room"
	const hasTourOfferSelection =
		context.isTour &&
		Boolean(String(context.productId ?? url.searchParams.get("productId") ?? "").trim()) &&
		Boolean(
			String(context.variantId ?? url.searchParams.get("variantId") ?? "").trim() ||
			String(context.ratePlanId ?? url.searchParams.get("ratePlanId") ?? "").trim()
		)
	if (!isCompletePlaybook && !isTourPlaybook && !hasAccommodationIntent && !hasTourOfferSelection)
		return null

	const params = new URLSearchParams(url.searchParams)
	const resolved = resolveTourPlaybookContext(url, context.productId)
	const useCompletePlaybook =
		context.step === "preview" ||
		resolved?.part === "publish" ||
		(hasTourOfferSelection && !isTourPlaybook && !hasAccommodationIntent && !isCompletePlaybook)
	params.set("playbook", useCompletePlaybook ? "complete-to-publish" : LAUNCH_TOUR_PLAYBOOK_ID)
	params.set(
		"step",
		context.step === "conditions" && useCompletePlaybook ? "bookingPolicies" : context.step
	)
	params.set("flow", useCompletePlaybook ? "complete" : "create")
	params.set("tourFlowVersion", "2")
	params.set("productId", context.productId)
	if (context.variantId) params.set("variantId", context.variantId)
	else params.delete("variantId")
	if (context.ratePlanId) params.set("ratePlanId", context.ratePlanId)
	else params.delete("ratePlanId")

	const href = `${url.pathname}?${params.toString()}${url.hash}`
	return href === `${url.pathname}${url.search}${url.hash}` ? null : href
}

/** Resolve preview navigation only after ownership and commercial selection are checked. */
export function getTourPreviewCanonicalHref(
	url: URL,
	context: Omit<TourSharedRateContext, "step">
): string | null {
	return getTourSharedRateCanonicalHref(url, { ...context, step: "preview" })
}

/** Keep a tour rate detail page out of accommodation playbooks and restore its exact context. */
export function getTourRateDetailCanonicalHref(
	url: URL,
	context: { isTour: boolean; productId: string; variantId: string; ratePlanId: string }
): string | null {
	return getTourSharedRateCanonicalHref(url, {
		...context,
		step:
			url.searchParams.get("vista") === "price" ||
			normalizeTourLaunchStep(url.searchParams.get("step")) === "rate"
				? "rate"
				: "conditions",
	})
}

export function resolveTourLaunchPlaybookFromUrl(url: URL): {
	active: boolean
	playbookId: typeof LAUNCH_TOUR_PLAYBOOK_ID | null
	stepId: TourLaunchStepId | null
} {
	const active = String(url.searchParams.get("playbook") ?? "").trim() === LAUNCH_TOUR_PLAYBOOK_ID
	const explicitStep = String(url.searchParams.get("step") ?? "").trim()
	const inferredStep = inferTourLaunchStepFromPathname(url.pathname)
	const stepId = active ? (getTourLaunchStepById(explicitStep)?.id ?? inferredStep) : null
	return { active, playbookId: active ? LAUNCH_TOUR_PLAYBOOK_ID : null, stepId }
}

/** An editing detour returns only to the same product review. */
export function tourPreparationReturnHref(value: unknown, productId: string): string | null {
	return tourPublicationReturn(value, productId)
}

export function tourPreparationNextHref(
	source: URLSearchParams,
	context: TourLaunchContext,
	currentStep: string
): string {
	const current = getTourLaunchStepById(currentStep)
	const path = current?.buildHref(context) ?? `/product/${context.productId}/content`
	const url = new URL(path, "http://fastt.local")
	url.search = source.toString()
	const resolved = resolveTourPlaybookContext(url, context.productId)
	if (resolved?.part === "publish")
		return (
			tourPublicationReturn(source.get("returnTo"), context.productId, context) ??
			tourPublicationHref(context.productId, context)
		)
	const next = getNextTourLaunchStep(currentStep) ?? getTourLaunchStepById("preview")!
	const href = next.buildHref(context)
	if (resolved?.returnHref && next.id !== "preview") {
		const target = new URL(href, "http://fastt.local")
		target.searchParams.set("returnTo", resolved.returnHref)
		return target.pathname + target.search
	}
	return href
}
