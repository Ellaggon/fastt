import { routes } from "@/lib/routes"
import type {
	ActiveWorkspaceVertical,
	WorkspaceNavigationScope,
} from "@/lib/workspace/verticalContext"

export type ProviderOperationalNavigationItem = {
	label: string
	href: string
	status: "canonical" | "transitional"
}

export type ProviderOperationalNavigationGroup = {
	title: string
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
				title: "Inicio",
				items: [{ label: "Resumen", href: routes.dashboard(), status: "canonical" }],
			},
			{
				title: "Alojamiento",
				items: [
					{ label: "Mis alojamientos", href: routes.accommodations(), status: "canonical" },
					{ label: "Habitaciones", href: routes.rooms(), status: "canonical" },
					{
						label: "Reglas para huéspedes",
						href: routes.providerHouseRules(),
						status: "canonical",
					},
				],
			},
			{
				title: "Venta",
				items: [
					{ label: "Tarifas", href: routes.rates(), status: "canonical" },
					{ label: "Calendario", href: routes.calendar(), status: "canonical" },
				],
			},
			{
				title: "Reservas",
				items: [{ label: "Reservas", href: routes.bookingList(), status: "canonical" }],
			},
			{
				title: "Finanzas",
				items: [{ label: "Finanzas", href: routes.financialOperations(), status: "canonical" }],
			},
			{
				title: "Configuración",
				items: [{ label: "Configuración", href: routes.settings(), status: "canonical" }],
			},
			{
				title: "Añadir",
				items: [{ label: "Añadir servicio", href: routes.productCreate(), status: "canonical" }],
			},
		]
	}

	if (vertical === "tour") {
		return [
			{
				title: "Inicio",
				items: [{ label: "Resumen", href: routes.dashboard(), status: "canonical" }],
			},
			{
				title: "Tours",
				items: [{ label: "Mis tours", href: routes.catalogTours(), status: "canonical" }],
			},
			{
				title: "Operación",
				items: [
					{ label: "Salidas y cupos", href: routes.calendar(), status: "canonical" },
					{ label: "Reservas", href: routes.bookingList(), status: "canonical" },
					{ label: "Operación de hoy", href: routes.bookingDayOf(), status: "canonical" },
				],
			},
			{ title: "Venta", items: [{ label: "Tarifas", href: routes.rates(), status: "canonical" }] },
			{
				title: "Finanzas",
				items: [{ label: "Finanzas", href: routes.financialOperations(), status: "canonical" }],
			},
			{
				title: "Configuración",
				items: [{ label: "Configuración", href: routes.settings(), status: "canonical" }],
			},
			{
				title: "Añadir",
				items: [{ label: "Añadir servicio", href: routes.productCreate(), status: "canonical" }],
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
