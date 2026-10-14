import { routes } from "@/lib/routes"

export type FinancialNavGroup = "operation"

export type FinancialNavItem = {
	label: string
	href: string
	group: FinancialNavGroup
	description: string
}

export const financialNavGroupLabels: Record<FinancialNavGroup, string> = {
	operation: "Operación",
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
]

/** Provider tasks keep their technical destinations; specialist reviews remain reachable. */
export function financialNavigationFor(vertical: string | null) {
	if (vertical !== "tour")
		return financialNavigationItems.map((item) => ({ ...item, secondary: false }))
	const labels: Record<string, string> = {
		"/financial": "Pendientes",
		"/financial/collections": "Cobros",
		"/financial/refunds": "Devoluciones",
		"/financial/settlements": "Conciliación",
		"/financial/provider-payables": "Importes del proveedor",
		"/financial/exceptions": "Excepciones",
	}
	const primary = new Set(["/financial", "/financial/collections", "/financial/refunds"])
	return financialNavigationItems
		.map((item) => ({
			...item,
			label: labels[item.href] ?? item.label,
			secondary: !primary.has(item.href),
		}))
		.sort((a, b) => Number(a.secondary) - Number(b.secondary))
}
