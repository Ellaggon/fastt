export const LAUNCH_PLAYBOOK_ID = "launch" as const

export type LaunchStepId =
	| "create"
	| "content"
	| "location"
	| "images"
	| "subtype"
	| "room-profile"
	| "house-rules"
	| "preview"

export type LaunchContext = {
	productId: string
	isHotel: boolean
}

export type LaunchStepDefinition = {
	id: LaunchStepId
	label: string
	guestImpact: string
	buildHref: (ctx: LaunchContext) => string
	appliesTo: (ctx: LaunchContext) => boolean
}

export const LAUNCH_PLAYBOOK_TITLE = "Preparar alojamiento"

export const LAUNCH_STEPS: LaunchStepDefinition[] = [
	{
		id: "create",
		label: "Crear alojamiento",
		guestImpact: "El nombre y tipo que identifican tu oferta",
		buildHref: () => buildPlaybookHref("/product/create", "create"),
		appliesTo: () => true,
	},
	{
		id: "content",
		label: "Descripción del alojamiento",
		guestImpact: "Lo que el huésped lee en la ficha",
		buildHref: (ctx) =>
			buildPlaybookHref(`/product/${encodeURIComponent(ctx.productId)}/content`, "content"),
		appliesTo: () => true,
	},
	{
		id: "location",
		label: "Ubicación",
		guestImpact: "Dónde se encuentra y cómo llegar",
		buildHref: (ctx) =>
			buildPlaybookHref(`/product/${encodeURIComponent(ctx.productId)}/location`, "location"),
		appliesTo: () => true,
	},
	{
		id: "images",
		label: "Fotos del alojamiento",
		guestImpact: "Las imágenes que generan confianza al huésped",
		buildHref: (ctx) =>
			buildPlaybookHref(`/product/${encodeURIComponent(ctx.productId)}/images`, "images"),
		appliesTo: () => true,
	},
	{
		id: "subtype",
		label: "Detalles del alojamiento",
		guestImpact: "Tipo, categoría y características visibles",
		buildHref: (ctx) =>
			buildPlaybookHref(`/product/${encodeURIComponent(ctx.productId)}/subtype`, "subtype"),
		appliesTo: () => true,
	},
	{
		id: "room-profile",
		label: "Primera habitación",
		guestImpact: "El espacio donde descansará el huésped",
		buildHref: (ctx) =>
			buildPlaybookHref(`/product/${encodeURIComponent(ctx.productId)}/rooms/new`, "room-profile"),
		appliesTo: (ctx) => ctx.isHotel,
	},
	{
		id: "house-rules",
		label: "Reglas para huéspedes",
		guestImpact: "Qué esperar durante la estadía",
		buildHref: (ctx) =>
			buildPlaybookHref(
				`/provider/house-rules?productId=${encodeURIComponent(ctx.productId)}`,
				"house-rules"
			),
		appliesTo: (ctx) => ctx.isHotel,
	},
	{
		id: "preview",
		label: "Vista previa y publicar",
		guestImpact: "Revisa cómo se verá antes de recibir reservas",
		buildHref: (ctx) =>
			buildPlaybookHref(`/product/${encodeURIComponent(ctx.productId)}/preview`, "preview"),
		appliesTo: () => true,
	},
]

export function buildPlaybookQueryString(step: LaunchStepId): string {
	return `playbook=${LAUNCH_PLAYBOOK_ID}&step=${encodeURIComponent(step)}&flow=create`
}

export function buildPlaybookHref(path: string, step: LaunchStepId): string {
	const [basePath, existingQuery = ""] = path.split("?")
	const params = new URLSearchParams(existingQuery)
	params.set("playbook", LAUNCH_PLAYBOOK_ID)
	params.set("step", step)
	params.set("flow", "create")
	return `${basePath}?${params.toString()}`
}

export function getApplicableLaunchSteps(ctx: LaunchContext): LaunchStepDefinition[] {
	return LAUNCH_STEPS.filter((step) => {
		if (step.id === "create" && ctx.productId) return false
		return step.appliesTo(ctx)
	})
}

export function getLaunchStepById(
	stepId: LaunchStepId | string | null | undefined,
	ctx: LaunchContext
): LaunchStepDefinition | null {
	return getApplicableLaunchSteps(ctx).find((step) => step.id === stepId) ?? null
}

export function getNextLaunchStep(
	currentStepId: LaunchStepId | string | null | undefined,
	ctx: LaunchContext
): LaunchStepDefinition | null {
	const steps = getApplicableLaunchSteps(ctx)
	const index = steps.findIndex((step) => step.id === currentStepId)
	if (index === -1 || index >= steps.length - 1) return null
	return steps[index + 1] ?? null
}

export function getPreviousLaunchStep(
	currentStepId: LaunchStepId | string | null | undefined,
	ctx: LaunchContext
): LaunchStepDefinition | null {
	const steps = getApplicableLaunchSteps(ctx)
	const index = steps.findIndex((step) => step.id === currentStepId)
	if (index <= 0) return null
	return steps[index - 1] ?? null
}

export function inferLaunchStepFromPathname(pathname: string): LaunchStepId | null {
	if (pathname === "/product/create") return "create"
	if (pathname.endsWith("/content")) return "content"
	if (pathname.endsWith("/location")) return "location"
	if (pathname.endsWith("/images")) return "images"
	if (pathname.endsWith("/subtype")) return "subtype"
	if (pathname.endsWith("/rooms/new")) return "room-profile"
	if (pathname.includes("/house-rules")) return "house-rules"
	if (pathname.endsWith("/preview")) return "preview"
	return null
}

export function isLaunchPlaybookActive(url: URL): boolean {
	const playbook = String(url.searchParams.get("playbook") ?? "")
		.trim()
		.toLowerCase()
	const flow = String(url.searchParams.get("flow") ?? "")
		.trim()
		.toLowerCase()
	return playbook === LAUNCH_PLAYBOOK_ID || playbook === "launch-accommodation" || flow === "create"
}

export function resolveLaunchPlaybookFromUrl(url: URL): {
	active: boolean
	playbookId: typeof LAUNCH_PLAYBOOK_ID | null
	stepId: LaunchStepId | null
} {
	const active = isLaunchPlaybookActive(url)
	const explicitStep = String(url.searchParams.get("step") ?? "").trim() as LaunchStepId
	const stepId = active ? explicitStep || inferLaunchStepFromPathname(url.pathname) : null

	return {
		active,
		playbookId: active ? LAUNCH_PLAYBOOK_ID : null,
		stepId,
	}
}
