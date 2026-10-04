import { routes } from "@/lib/routes"
import type {
	ActiveWorkspaceVertical,
	WorkspaceNavigationScope,
} from "@/lib/workspace/verticalContext"

export type ProviderNavigationItemId =
	| "overview"
	| "bookings"
	| "today"
	| "availability"
	| "tour-catalog"
	| "pricing"
	| "finance"
	| "settings"
	| "support"
	| "accommodations"
	| "rooms"
	| "house-rules"
	| `route:${string}`

export type ProviderOperationalNavigationItem = {
	id: ProviderNavigationItemId
	label: string
	href: string
	status: "canonical" | "transitional"
}

export type ProviderOperationalNavigationGroup = {
	id: string
	heading?: string
	items: ProviderOperationalNavigationItem[]
	collapsible?: boolean
}

/**
 * Keeps the provider sidebar tied to the active commercial vertical. The links
 * are existing workspace surfaces; the scope is applied by DashboardSidebar so
 * it remains shareable and does not become an authorization mechanism.
 */
export function providerOperationalNavigation(
	vertical: ActiveWorkspaceVertical | null
): ProviderOperationalNavigationGroup[] | null {
	if (vertical === "hotel") {
		return [
			{
				id: "start",
				items: [
					{ id: "overview", label: "Resumen", href: routes.dashboard(), status: "canonical" },
				],
			},
			{
				id: "accommodation",
				heading: "Alojamiento",
				items: [
					{
						id: "accommodations",
						label: "Mis alojamientos",
						href: routes.accommodations(),
						status: "canonical",
					},
					{ id: "rooms", label: "Habitaciones", href: routes.rooms(), status: "canonical" },
					{
						id: "house-rules",
						label: "Reglas para huéspedes",
						href: routes.providerHouseRules(),
						status: "canonical",
					},
				],
			},
			{
				id: "sales",
				heading: "Venta",
				items: [
					{ id: "pricing", label: "Tarifas", href: routes.rates(), status: "canonical" },
					{ id: "availability", label: "Calendario", href: routes.calendar(), status: "canonical" },
				],
			},
			{
				id: "bookings",
				heading: "Reservas",
				items: [
					{ id: "bookings", label: "Reservas", href: routes.bookingList(), status: "canonical" },
				],
			},
			{
				id: "finance",
				heading: "Finanzas",
				items: [
					{
						id: "finance",
						label: "Finanzas",
						href: routes.financialOperations(),
						status: "canonical",
					},
				],
			},
			{
				id: "utilities",
				heading: "Configuración",
				items: [
					{ id: "settings", label: "Configuración", href: routes.settings(), status: "canonical" },
					{ id: "support", label: "Soporte", href: routes.providerSupport(), status: "canonical" },
				],
			},
		]
	}

	if (vertical === "tour") {
		return [
			{
				id: "start",
				items: [
					{ id: "overview", label: "Resumen", href: routes.dashboard(), status: "canonical" },
				],
			},
			{
				id: "operation",
				heading: "Operación",
				items: [
					{ id: "bookings", label: "Reservas", href: routes.bookingList(), status: "canonical" },
					{
						id: "today",
						label: "Salidas de hoy",
						href: routes.bookingDayOf(),
						status: "canonical",
					},
					{
						id: "availability",
						label: "Salidas y cupos",
						href: routes.calendar(),
						status: "canonical",
					},
				],
			},
			{
				id: "offer",
				heading: "Oferta",
				items: [
					{
						id: "tour-catalog",
						label: "Mis tours",
						href: routes.catalogTours(),
						status: "canonical",
					},
					{
						id: "pricing",
						label: "Precios y condiciones",
						href: routes.rates(),
						status: "canonical",
					},
				],
			},
			{
				id: "finance",
				items: [
					{
						id: "finance",
						label: "Finanzas",
						href: routes.financialOperations(),
						status: "canonical",
					},
				],
			},
			{
				id: "utilities",
				items: [
					{ id: "settings", label: "Configuración", href: routes.settings(), status: "canonical" },
					{ id: "support", label: "Soporte", href: routes.providerSupport(), status: "canonical" },
				],
			},
		]
	}

	return null
}

export function resolveOperationalSidebarVertical(input: {
	workspaceScope: WorkspaceNavigationScope
	availableVerticals: readonly ActiveWorkspaceVertical[]
}): ActiveWorkspaceVertical | null {
	if (input.workspaceScope.vertical) return input.workspaceScope.vertical
	return input.availableVerticals.length === 1 ? (input.availableVerticals[0] ?? null) : null
}
