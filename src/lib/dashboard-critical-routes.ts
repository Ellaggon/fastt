/**
 * Rutas críticas del dashboard para la migración arquitectónica.
 *
 * Estas rutas concentran mayor profundidad, carga operativa o riesgo funcional
 * y deben mantenerse estables durante las fases de transición.
 */
export const DASHBOARD_CRITICAL_ROUTES = {
	deepNavigation: [
		"/product/:id/variants/:variantId/pricing/calendar",
		"/product/:id/variants/:variantId/inventory",
	],
	highBusinessImpact: ["/booking", "/api/inventory/hold", "/api/booking/confirm"],
	policyAndRates: [
		"/provider/policies",
		"/provider/policies/:policyId/edit",
		"/provider/policies/audit",
		"/provider/policies/rate-plans",
	],
	nonBreakableCompatibility: [
		"/product",
		"/product/:id",
		"/product/:id/variants",
		"/product/:id/variants/:variantId/pricing",
	],
} as const

export type DashboardCriticalRoutes = typeof DASHBOARD_CRITICAL_ROUTES
