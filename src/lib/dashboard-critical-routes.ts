/**
 * Rutas críticas del dashboard para la migración arquitectónica.
 *
 * Estas rutas concentran mayor profundidad, carga operativa o riesgo funcional
 * y deben mantenerse estables durante las fases de transición.
 */
export const DASHBOARD_CRITICAL_ROUTES = {
	deepNavigation: ["/product/:id/rooms/:roomId/inventory"],
	highBusinessImpact: ["/booking", "/api/inventory/hold", "/api/booking/confirm"],
	policyAndRates: [
		"/provider/policies",
		"/provider/policies/:policyId/edit",
		"/provider/policies/audit",
	],
	nonBreakableCompatibility: ["/product", "/product/:id", "/product/:id/rooms"],
} as const

export type DashboardCriticalRoutes = typeof DASHBOARD_CRITICAL_ROUTES
