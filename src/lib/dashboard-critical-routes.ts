/**
 * Rutas críticas del dashboard para la migración arquitectónica.
 *
 * Estas rutas concentran mayor profundidad, carga operativa o riesgo funcional
 * y deben mantenerse estables durante las fases de transición.
 */
export const DASHBOARD_CRITICAL_ROUTES = {
	deepNavigation: ["/rates/calendar"],
	highBusinessImpact: ["/booking", "/api/inventory/hold", "/api/booking/confirm"],
	policyAndRates: ["/rates/plans/:ratePlanId/policies", "/rates/multi-calendar?tab=conditions"],
	nonBreakableCompatibility: ["/product", "/product/:id", "/product/:id/rooms"],
} as const

export type DashboardCriticalRoutes = typeof DASHBOARD_CRITICAL_ROUTES
