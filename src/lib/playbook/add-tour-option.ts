export const ADD_TOUR_OPTION = "add-tour-option" as const
export const OPTION_STEPS = [
	{ id: "profile", label: "Opción y horario" },
	{ id: "price", label: "Precio" },
	{ id: "conditions", label: "Condiciones" },
	{ id: "calendar", label: "Fechas y cupos" },
	{ id: "review", label: "Revisar y activar" },
] as const
export type OptionStep = (typeof OPTION_STEPS)[number]["id"]
export type OptionWizardContext = {
	productId: string
	sessionId: string
	variantId?: string | null
	ratePlanId?: string | null
}

export type OptionWizardStageState = "ready" | "pending" | "blocked" | "not_evaluable"

export type OptionWizardStage = {
	id: OptionStep
	label: string
	position: number
	total: number
	state: OptionWizardStageState
	pendingReason: string | null
	href: string
}

export function optionStepLocked(
	stepId: OptionStep,
	variantId?: string | null,
	ratePlanId?: string | null
) {
	if (stepId !== "profile" && !variantId) return true
	if (["conditions", "calendar", "review"].includes(stepId) && !ratePlanId) return true
	return false
}

export function projectOptionWizardStages(
	context: OptionWizardContext,
	activeStep: OptionStep,
	options: { entryIntent?: "first_publication" | "additional_option" | null } = {}
): OptionWizardStage[] {
	const activeIndex = OPTION_STEPS.findIndex((step) => step.id === activeStep)
	const variantId = context.variantId ?? null
	const ratePlanId = context.ratePlanId ?? null
	return OPTION_STEPS.map((step, index) => {
		const locked = optionStepLocked(step.id, variantId, ratePlanId)
		const label =
			step.id === "review" && options.entryIntent === "first_publication"
				? "Revisar primera opción"
				: step.label
		let state: OptionWizardStageState = "pending"
		if (index < activeIndex) state = "ready"
		else if (locked && index > activeIndex) state = "blocked"
		let pendingReason: string | null = null
		if (locked) {
			if (step.id !== "profile" && !variantId)
				pendingReason = "Guarda primero el perfil de la opción."
			else if (["conditions", "calendar", "review"].includes(step.id) && !ratePlanId)
				pendingReason = "Configura primero una tarifa."
		}
		return {
			id: step.id,
			label,
			position: index + 1,
			total: OPTION_STEPS.length,
			state,
			pendingReason,
			href: locked ? "" : optionWizardHref(context, step.id),
		}
	})
}
export function optionStep(value: unknown): OptionStep {
	return OPTION_STEPS.some((step) => step.id === value) ? (value as OptionStep) : "profile"
}
export function optionWizardHref(context: OptionWizardContext, step: OptionStep) {
	const product = encodeURIComponent(context.productId)
	let path =
		step === "profile"
			? `/product/${product}/departures/${context.variantId ? encodeURIComponent(context.variantId) : "new"}`
			: step === "review" && context.variantId
				? `/product/${product}/departures/${encodeURIComponent(context.variantId)}/review`
				: step === "calendar"
					? "/rates/calendar"
					: context.ratePlanId
						? `/rates/plans/${encodeURIComponent(context.ratePlanId)}`
						: "/rates/plans/manage"
	const params = new URLSearchParams({
		playbook: ADD_TOUR_OPTION,
		step,
		sessionId: context.sessionId,
		productId: context.productId,
	})
	if (context.variantId) params.set("variantId", context.variantId)
	if (context.ratePlanId) params.set("ratePlanId", context.ratePlanId)
	if (step === "price") {
		params.set("vista", "price")
		if (!context.ratePlanId) params.set("openDialog", "1")
	}
	if (step === "conditions") params.set("vista", "conditions")
	if (step === "calendar") {
		params.set("focus", "availability")
		params.set("schedule", "1")
	}
	return `${path}?${params}`
}
export function optionWizardContext(url: URL): OptionWizardContext | null {
	if (url.searchParams.get("playbook") !== ADD_TOUR_OPTION) return null
	return {
		productId:
			url.pathname.match(/^\/product\/([^/]+)/)?.[1] || url.searchParams.get("productId") || "",
		sessionId: url.searchParams.get("sessionId") || "",
		variantId: url.searchParams.get("variantId"),
		ratePlanId: url.searchParams.get("ratePlanId"),
	}
}
export function optionNextHref(
	source: URLSearchParams,
	context: { productId: string; variantId?: string | null; ratePlanId?: string | null },
	current: string
) {
	const step =
		current === "departure"
			? "profile"
			: current === "rate"
				? "price"
				: current === "bookingPolicies"
					? "conditions"
					: optionStep(current)
	const index = OPTION_STEPS.findIndex((item) => item.id === step)
	const target =
		source.get("optionReturn") === "review" ? "review" : OPTION_STEPS[Math.min(index + 1, 4)].id
	return optionWizardHref({ ...context, sessionId: source.get("sessionId") || "" }, target)
}
