export type RestrictionScope = "product" | "variant" | "rate_plan"

export type RestrictionPreset = {
	key: string
	name: string
	description: string
	allowedScopes: RestrictionScope[]
	explain?: string
	params: unknown[]
	defaultValues?: Record<string, unknown>
}

export const RESTRICTION_CATEGORIES = [
	"Availability",
	"LengthOfStay",
	"ArrivalDeparture",
	"BookingWindow",
	"Occupancy",
	"Pricing",
	"Inventory",
] as const

export type RestrictionCategory = (typeof RESTRICTION_CATEGORIES)[number]

export const SCOPE_LABELS: Record<RestrictionScope, string> = {
	product: "Alojamiento",
	variant: "Habitación",
	rate_plan: "Plan tarifario",
}