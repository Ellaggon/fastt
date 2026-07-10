import { routes } from "@/lib/routes"

export const ADD_ROOM_PLAYBOOK_ID = "add-room" as const

export type AddRoomStepId =
	| "choose-accommodation"
	| "create-room"
	| "room-photos"
	| "create-rate"
	| "conditions"
	| "availability"
	| "confirmation"

export type AddRoomContext = {
	productId: string
	variantId?: string
	ratePlanId?: string
}

export type AddRoomStepDefinition = {
	id: AddRoomStepId
	label: string
	guestImpact: string
	buildHref: (ctx: AddRoomContext) => string
	appliesTo: (ctx: AddRoomContext) => boolean
}

export const ADD_ROOM_PLAYBOOK_TITLE = "Nueva habitación vendible"

export const ADD_ROOM_STEPS: AddRoomStepDefinition[] = [
	{
		id: "choose-accommodation",
		label: "Elegir alojamiento",
		guestImpact: "Selecciona dónde agregarás la habitación",
		buildHref: () => buildAddRoomHref(routes.catalogAccommodationRooms(), "choose-accommodation"),
		appliesTo: (ctx) => !ctx.productId,
	},
	{
		id: "create-room",
		label: "Crear habitación",
		guestImpact: "El espacio donde descansará el huésped",
		buildHref: (ctx) => buildAddRoomHref(routes.productRoomNew(ctx.productId), "create-room"),
		appliesTo: () => true,
	},
	{
		id: "room-photos",
		label: "Fotos de la habitación",
		guestImpact: "Imágenes que generan confianza al reservar",
		buildHref: (ctx) =>
			buildAddRoomHref(
				`${routes.productRoomDetail(ctx.productId, String(ctx.variantId ?? ""))}#fotos`,
				"room-photos"
			),
		appliesTo: (ctx) => Boolean(ctx.variantId),
	},
	{
		id: "create-rate",
		label: "Crear tarifa",
		guestImpact: "Cómo se vende esta habitación: precio y propuesta",
		buildHref: (ctx) => {
			const params = new URLSearchParams({
				openDialog: "1",
				variantId: String(ctx.variantId ?? ""),
			})
			return buildAddRoomHref(`${routes.rates()}?${params.toString()}`, "create-rate")
		},
		appliesTo: (ctx) => Boolean(ctx.variantId),
	},
	{
		id: "conditions",
		label: "Condiciones de reserva",
		guestImpact: "Cancelación, pago y reglas que acepta el huésped",
		buildHref: (ctx) =>
			buildAddRoomHref(
				`${routes.ratePlanDetail(String(ctx.ratePlanId ?? ""))}?vista=conditions&variantId=${encodeURIComponent(String(ctx.variantId ?? ""))}`,
				"conditions"
			),
		appliesTo: (ctx) => Boolean(ctx.variantId && ctx.ratePlanId),
	},
	{
		id: "availability",
		label: "Disponibilidad",
		guestImpact: "Fechas en las que la habitación puede recibir reservas",
		buildHref: (ctx) => {
			const params = new URLSearchParams({
				focus: "availability",
				variantId: String(ctx.variantId ?? ""),
			})
			if (ctx.ratePlanId) params.set("ratePlanId", ctx.ratePlanId)
			return buildAddRoomHref(`${routes.calendar()}?${params.toString()}`, "availability")
		},
		appliesTo: (ctx) => Boolean(ctx.variantId),
	},
	{
		id: "confirmation",
		label: "Habitación lista",
		guestImpact: "Confirma que la habitación ya puede venderse",
		buildHref: (ctx) => {
			const params = new URLSearchParams()
			if (ctx.variantId) params.set("variantId", ctx.variantId)
			const query = params.toString()
			const base = routes.productRoomsForProduct(ctx.productId)
			return buildAddRoomHref(query ? `${base}?${query}` : base, "confirmation")
		},
		appliesTo: () => true,
	},
]

export function buildAddRoomHref(path: string, step: AddRoomStepId): string {
	const [basePath, hash = ""] = path.split("#")
	const [pathname, existingQuery = ""] = basePath.split("?")
	const params = new URLSearchParams(existingQuery)
	params.set("playbook", ADD_ROOM_PLAYBOOK_ID)
	params.set("step", step)
	params.set("flow", "add-room")
	const query = params.toString()
	return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`
}

export function getApplicableAddRoomSteps(ctx: AddRoomContext): AddRoomStepDefinition[] {
	return ADD_ROOM_STEPS.filter((step) => {
		if (step.id === "choose-accommodation" && ctx.productId) return false
		return step.appliesTo(ctx)
	})
}

export function getAddRoomStepById(
	stepId: AddRoomStepId | string | null | undefined,
	ctx: AddRoomContext
): AddRoomStepDefinition | null {
	return getApplicableAddRoomSteps(ctx).find((step) => step.id === stepId) ?? null
}

export function getNextAddRoomStep(
	currentStepId: AddRoomStepId | string | null | undefined,
	ctx: AddRoomContext
): AddRoomStepDefinition | null {
	const steps = getApplicableAddRoomSteps(ctx)
	const index = steps.findIndex((step) => step.id === currentStepId)
	if (index === -1 || index >= steps.length - 1) return null
	return steps[index + 1] ?? null
}

export function getPreviousAddRoomStep(
	currentStepId: AddRoomStepId | string | null | undefined,
	ctx: AddRoomContext
): AddRoomStepDefinition | null {
	const steps = getApplicableAddRoomSteps(ctx)
	const index = steps.findIndex((step) => step.id === currentStepId)
	if (index <= 0) return null
	return steps[index - 1] ?? null
}

export function inferAddRoomStepFromPathname(pathname: string): AddRoomStepId | null {
	if (pathname === "/catalog/accommodations/rooms") return "choose-accommodation"
	if (pathname.endsWith("/rooms/new")) return "create-room"
	if (pathname.includes("/rooms/") && !pathname.endsWith("/rooms/new")) return "room-photos"
	if (pathname.includes("/rates/plans/manage")) return "create-rate"
	if (pathname.includes("/rates/plans/") && !pathname.includes("/manage")) return "conditions"
	if (pathname.includes("/rates/calendar")) return "availability"
	if (pathname.endsWith("/rooms")) return "confirmation"
	return null
}

export function isAddRoomPlaybookActive(url: URL): boolean {
	const playbook = String(url.searchParams.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	const flow = String(url.searchParams.get("flow") ?? "")
		.trim()
		.toLowerCase()
	return playbook === ADD_ROOM_PLAYBOOK_ID || flow === "add-room"
}

export function resolveAddRoomPlaybookFromUrl(url: URL): {
	active: boolean
	playbookId: typeof ADD_ROOM_PLAYBOOK_ID | null
	stepId: AddRoomStepId | null
	productId: string
	variantId: string
	ratePlanId: string
} {
	const active = isAddRoomPlaybookActive(url)
	const explicitStep = String(url.searchParams.get("step") ?? "").trim() as AddRoomStepId
	const productId = String(url.searchParams.get("productId") ?? "").trim()
	const pathProductMatch = url.pathname.match(/^\/product\/([^/]+)/)
	const resolvedProductId = productId || (pathProductMatch?.[1] ?? "")
	const variantId =
		String(url.searchParams.get("variantId") ?? "").trim() ||
		(url.pathname.match(/\/rooms\/([^/]+)/)?.[1] && !url.pathname.endsWith("/rooms/new")
			? String(url.pathname.match(/\/rooms\/([^/]+)/)?.[1] ?? "").trim()
			: "")
	const ratePlanId =
		String(url.searchParams.get("ratePlanId") ?? "").trim() ||
		(url.pathname.match(/\/rates\/plans\/([^/]+)/)?.[1] && !url.pathname.includes("/manage")
			? String(url.pathname.match(/\/rates\/plans\/([^/]+)/)?.[1] ?? "").trim()
			: "")

	const stepId = active ? explicitStep || inferAddRoomStepFromPathname(url.pathname) : null

	return {
		active,
		playbookId: active ? ADD_ROOM_PLAYBOOK_ID : null,
		stepId,
		productId: resolvedProductId,
		variantId,
		ratePlanId,
	}
}

export type AddRoomRoomState = {
	states?: {
		capacityComplete?: boolean
		photosComplete?: boolean
		tariffsComplete?: boolean
		inventoryComplete?: boolean
		isComplete?: boolean
	}
	tariffs?: {
		defaultId?: string | null
		count?: number
	}
	id?: string
}

export function inferAddRoomResumeStep(room: AddRoomRoomState): AddRoomStepId {
	const states = room.states ?? {}
	if (!states.capacityComplete) return "create-room"
	if (!states.photosComplete) return "room-photos"
	if (!states.tariffsComplete) return "create-rate"
	if (!states.inventoryComplete) return "availability"
	return "confirmation"
}

export function buildAddRoomResumeHref(productId: string, room: AddRoomRoomState): string {
	const variantId = String(room.id ?? "").trim()
	const ctx: AddRoomContext = {
		productId,
		variantId,
		ratePlanId: String(room.tariffs?.defaultId ?? "").trim() || undefined,
	}
	const step = inferAddRoomResumeStep(room)
	if (step === "create-room" && variantId) {
		return buildAddRoomHref(routes.productRoomDetail(productId, variantId), "create-room")
	}
	return getAddRoomStepById(step, ctx)?.buildHref(ctx) ?? routes.productRoomsForProduct(productId)
}

export function buildAddRoomEntryHref(productId?: string): string {
	if (productId) {
		return buildAddRoomHref(routes.productRoomNew(productId), "create-room")
	}
	return buildAddRoomHref(routes.catalogAccommodationRooms(), "choose-accommodation")
}
