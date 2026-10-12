/** Discovery taxonomy is descriptive; it never grants commercial authorization. */
export type ExperienceActivity = {
	id: string
	name: string
	slug: string
	parentCategoryId: string | null
	classificationKind: string
	isActive: boolean
	vertical: string
	dataClass: string
	searchAliasesJson?: unknown
}
export function evaluateExperienceClassification(input: {
	activityContractVersion?: number
	primaryActivityCategoryId?: string | null
	primaryActivity?: ExperienceActivity | null
	hasLegacyCategory?: boolean
}) {
	if ((input.activityContractVersion ?? 0) === 0)
		return { status: "legacy" as const, ready: Boolean(input.hasLegacyCategory) }
	if (!input.primaryActivityCategoryId) return { status: "missing_activity" as const, ready: false }
	const activity = input.primaryActivity
	const ready = Boolean(
		activity &&
		activity.id === input.primaryActivityCategoryId &&
		activity.classificationKind === "activity" &&
		activity.vertical === "tour" &&
		activity.dataClass === "production" &&
		activity.isActive
	)
	return { status: ready ? ("ready" as const) : ("needs_review" as const), ready }
}
export const EXPERIENCE_BUSINESS_KINDS = {
	operator: "Operador o guía",
	creative_studio: "Estudio o taller creativo",
	school: "Escuela o academia",
	food_business: "Negocio gastronómico",
	producer: "Productor o finca",
	cultural_center: "Centro cultural",
	wellness_studio: "Estudio de bienestar",
	sports_operator: "Operador deportivo",
	science_center: "Centro de divulgación",
	other: "Otro negocio de actividades",
} as const
export function parseExperienceBusinessKinds(value: unknown): string[] {
	if (
		!Array.isArray(value) ||
		value.length > 10 ||
		value.some(
			(item) => typeof item !== "string" || !Object.hasOwn(EXPERIENCE_BUSINESS_KINDS, item)
		)
	)
		throw new Error("Selecciona tipos de negocio disponibles.")
	return [...new Set(value)]
}
