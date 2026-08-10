export const LAUNCH_TOUR_PLAYBOOK_ID = "launch-tour" as const
export const LAUNCH_TOUR_PLAYBOOK_TITLE = "Preparar tour"

export type TourLaunchStepId =
	| "create"
	| "content"
	| "location"
	| "images"
	| "subtype"
	| "tickets"
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

export const TOUR_LAUNCH_STEPS: TourLaunchStepDefinition[] = [
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
		label: "Punto de encuentro",
		guestImpact: "Dónde comienza la experiencia.",
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
		label: "Modalidades",
		guestImpact: "Quién puede reservar y bajo qué tipo de ticket.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/tickets`, "tickets"),
	},
	{
		id: "departure",
		label: "Primera salida",
		guestImpact: "Fecha, hora, cupo e idioma disponibles para reservar.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(
				`/product/${encodeURIComponent(productId)}/departures/new`,
				"departure"
			),
	},
	{
		id: "rate",
		label: "Precio",
		guestImpact: "El precio de venta de la salida.",
		buildHref: ({ productId, variantId }) => {
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
				const params = new URLSearchParams({ vista: "conditions" })
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
		buildHref: ({ variantId, ratePlanId }) => {
			const params = new URLSearchParams({ focus: "availability" })
			if (variantId) params.set("variantId", variantId)
			if (ratePlanId) params.set("ratePlanId", ratePlanId)
			return buildTourPlaybookHref(`/rates/calendar?${params}`, "calendar")
		},
	},
	{
		id: "preview",
		label: "Vista previa y publicar",
		guestImpact: "Revisa la oferta antes de recibir reservas.",
		buildHref: ({ productId }) =>
			buildTourPlaybookHref(`/product/${encodeURIComponent(productId)}/preview`, "preview"),
	},
]

export function buildTourPlaybookHref(path: string, step: TourLaunchStepId): string {
	const [basePath, existingQuery = ""] = path.split("?")
	const params = new URLSearchParams(existingQuery)
	params.set("playbook", LAUNCH_TOUR_PLAYBOOK_ID)
	params.set("step", step)
	params.set("flow", "create")
	return `${basePath}?${params}`
}

export function getTourLaunchStepById(
	stepId: TourLaunchStepId | string | null | undefined
): TourLaunchStepDefinition | null {
	return TOUR_LAUNCH_STEPS.find((step) => step.id === stepId) ?? null
}

export function getNextTourLaunchStep(
	currentStepId: TourLaunchStepId | string | null | undefined
): TourLaunchStepDefinition | null {
	const index = TOUR_LAUNCH_STEPS.findIndex((step) => step.id === currentStepId)
	if (index < 0 || index >= TOUR_LAUNCH_STEPS.length - 1) return null
	return TOUR_LAUNCH_STEPS[index + 1] ?? null
}

export function getPreviousTourLaunchStep(
	currentStepId: TourLaunchStepId | string | null | undefined
): TourLaunchStepDefinition | null {
	const index = TOUR_LAUNCH_STEPS.findIndex((step) => step.id === currentStepId)
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
	if (pathname.endsWith("/departures/new")) return "departure"
	if (pathname.includes("/rates/plans/manage")) return "rate"
	if (pathname.match(/\/rates\/plans\/[^/]+$/)) return "conditions"
	if (pathname.includes("/rates/calendar")) return "calendar"
	if (pathname.endsWith("/preview")) return "preview"
	return null
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
