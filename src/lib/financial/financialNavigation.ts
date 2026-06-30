import { routes } from "@/lib/routes"

export type FinancialNavGroup = "operation" | "configuration"

export type FinancialNavItem = {
	label: string
	href: string
	group: FinancialNavGroup
	description: string
}

export const financialNavGroupLabels: Record<FinancialNavGroup, string> = {
	operation: "Operación",
	configuration: "Configuración",
}

export const financialNavigationItems: FinancialNavItem[] = [
	{
		label: "Bandeja financiera",
		href: routes.financialOperations(),
		group: "operation",
		description: "Casos que requieren atención, seguimiento o cierre.",
	},
	{
		label: "Cobros",
		href: routes.financialCollections(),
		group: "operation",
		description: "Seguimiento de cobros, comprobantes recibidos y faltantes.",
	},
	{
		label: "Liquidaciones",
		href: routes.financialSettlements(),
		group: "operation",
		description: "Comparación operativa entre reserva, cobro y comprobantes de liquidación.",
	},
	{
		label: "Pagos a proveedores",
		href: routes.financialProviderPayables(),
		group: "operation",
		description: "Visibilidad de importes pendientes, bloqueos y próxima acción.",
	},
	{
		label: "Reembolsos",
		href: routes.financialRefunds(),
		group: "operation",
		description: "Seguimiento de revisiones y comprobantes asociados a reembolsos.",
	},
	{
		label: "Excepciones",
		href: routes.financialExceptions(),
		group: "operation",
		description: "Casos financieros que requieren revisión y no encajan en un flujo único.",
	},
	{
		label: "Impuestos y cargos",
		href: routes.providerTaxFees(),
		group: "configuration",
		description: "Reglas comerciales visibles para huéspedes antes de reservar.",
	},
]
