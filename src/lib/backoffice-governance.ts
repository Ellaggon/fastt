import { routes } from "@/lib/routes"

export type GovernanceStatus =
	| "canonical"
	| "transitional"
	| "legacy"
	| "internal-only"
	| "public"
	| "planned"

export type OperationalContext =
	| "public-marketplace"
	| "provider-workspace"
	| "enterprise-operations"
	| "internal-admin"
	| "internal-ops"
	| "governance"
	| "support"

export type BackofficeRouteClassification = {
	pattern: string
	status: GovernanceStatus
	context: OperationalContext
	owner: string
	rationale: string
}

export type BackofficeShellClassification = {
	shell: string
	status: GovernanceStatus
	context: OperationalContext
	rule: string
}

export type EnterpriseNavigationItem = {
	label: string
	href: string
	status: Extract<GovernanceStatus, "canonical" | "transitional">
	level?: 1 | 2 | 3 | 4
	summary?: string
}

export type EnterpriseNavigationSection = {
	title: string
	subtitle: string
	owner: string
	context: OperationalContext
	operationalIntent: string
	maturity: "operational" | "transitional"
	nextMaturity?: string
	items: EnterpriseNavigationItem[]
	planned?: readonly string[]
}

export type SidebarDisclosureMode =
	| "small-provider"
	| "professional-tools"
	| "scaled-provider"
	| "internal-admin"
	| "revenue-ops"

export type SidebarDisclosureContext = {
	mode: SidebarDisclosureMode
	activeHref?: string
}

export type RoomsAndRatesOwnership = "commercial" | "physical" | "financial"

export type RoomsAndRatesSurface = {
	label: string
	status: GovernanceStatus
	owner: string
	description: string
	href?: string
}

export type RoomsAndRatesOperationalLane = {
	title: string
	ownership: RoomsAndRatesOwnership
	status: "operational" | "transitional" | "planned"
	intent: string
	surfaces: readonly RoomsAndRatesSurface[]
}

export type OperationalContextMetadata = {
	label: string
	description: string
}

export type GovernanceStatusMetadata = {
	label: string
	description: string
	tone: "green" | "amber" | "slate"
}

function escapeRegExp(value: string): string {
	return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
}

function patternToRegExp(pattern: string): RegExp {
	const escaped = escapeRegExp(pattern)
		.replace(/\/\*\*/g, "(?:/.*)?")
		.replace(/:\w+/g, "[^/]+")
	return new RegExp(`^${escaped}$`)
}

export const backofficeShells: BackofficeShellClassification[] = [
	{
		shell: "WorkspaceLayout",
		status: "canonical",
		context: "enterprise-operations",
		rule: "Canonical shell for provider workspace and enterprise operational surfaces.",
	},
	{
		shell: "InternalAdminLayout",
		status: "canonical",
		context: "internal-admin",
		rule: "Canonical shell for internal admin surfaces; never used for provider workspace.",
	},
	{
		shell: "DashboardLayout",
		status: "canonical",
		context: "enterprise-operations",
		rule: "Compatibility alias that renders WorkspaceLayout; it must not own separate navigation.",
	},
	{
		shell: "UILayout",
		status: "public",
		context: "public-marketplace",
		rule: "Public marketplace shell only.",
	},
	{
		shell: "SearchLayout",
		status: "public",
		context: "public-marketplace",
		rule: "Public search/discovery shell only.",
	},
	{
		shell: "Layout",
		status: "transitional",
		context: "public-marketplace",
		rule: "Base shell for auth/public/simple pages; not a provider workspace shell.",
	},
]

export const operationalContextMetadata: Record<OperationalContext, OperationalContextMetadata> = {
	"public-marketplace": {
		label: "Public Marketplace",
		description: "Guest discovery and conversion surfaces.",
	},
	"provider-workspace": {
		label: "Espacio del proveedor",
		description: "Superficies de contenido y configuración física gestionadas por el proveedor.",
	},
	"enterprise-operations": {
		label: "Operación comercial",
		description: "Superficies comerciales, de reservas, finanzas y control operativo.",
	},
	"internal-admin": {
		label: "Administración interna",
		description: "Superficies de administración y gobernanza solo para plataforma.",
	},
	"internal-ops": {
		label: "Operaciones internas",
		description: "Diagnósticos, observabilidad y herramientas operativas.",
	},
	"governance": {
		label: "Gobernanza",
		description: "Organización, verificación y superficies de control del proveedor.",
	},
	"support": {
		label: "Support",
		description: "Support operations and knowledge workflows.",
	},
}

export const governanceStatusMetadata: Record<GovernanceStatus, GovernanceStatusMetadata> = {
	"canonical": {
		label: "Operational",
		description: "Canonical surface for the current operation.",
		tone: "green",
	},
	"transitional": {
		label: "Transitional",
		description: "Real governed surface; not yet the final enterprise module.",
		tone: "amber",
	},
	"legacy": {
		label: "Legacy",
		description: "Superficie aislada de compatibilidad; no pertenece a la navegación primaria.",
		tone: "slate",
	},
	"internal-only": {
		label: "Solo interno",
		description: "Oculto de la navegación del proveedor.",
		tone: "slate",
	},
	"public": {
		label: "Público",
		description: "Superficie pública o de autenticación.",
		tone: "slate",
	},
	"planned": {
		label: "Planned",
		description: "Roadmap marker only; not an active workspace.",
		tone: "slate",
	},
}

export const backofficeRouteClassifications: BackofficeRouteClassification[] = [
	{
		pattern: "/dashboard",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Command Center",
		rationale: "Primary operational entry point.",
	},
	{
		pattern: "/rooms",
		status: "legacy",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Short alias that redirects to the accommodation rooms workspace.",
	},
	{
		pattern: "/product/rooms",
		status: "legacy",
		context: "provider-workspace",
		owner: "Contenido de alojamiento",
		rationale: "Ruta legacy de catálogo que redirige al espacio de habitaciones del alojamiento.",
	},
	{
		pattern: "/catalog/accommodations/rooms",
		status: "canonical",
		context: "provider-workspace",
		owner: "Contenido de alojamiento",
		rationale:
			"Selector de habitaciones para alojamientos; las habitaciones pertenecen al vertical hotel/alojamiento, no a una oferta genérica.",
	},
	{
		pattern: "/catalog/accommodations",
		status: "transitional",
		context: "provider-workspace",
		owner: "Contenido de alojamiento",
		rationale:
			"Alias vertical que abre el catálogo filtrado a alojamientos mientras la raíz genérica de ofertas converge.",
	},
	{
		pattern: "/catalog/tours",
		status: "transitional",
		context: "provider-workspace",
		owner: "Contenido de alojamiento",
		rationale:
			"Alias vertical que abre el catálogo filtrado a tours mientras la raíz genérica de ofertas converge.",
	},
	{
		pattern: "/catalog/packages",
		status: "transitional",
		context: "provider-workspace",
		owner: "Contenido de alojamiento",
		rationale:
			"Alias vertical que abre el catálogo filtrado a paquetes mientras la raíz genérica de ofertas converge.",
	},
	{
		pattern: "/product/:id/rooms",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Cliente-first room surface for one accommodation; providers manage room profiles from rooms routes.",
	},
	{
		pattern: "/product/:id/rooms/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Rutas canónicas de creación, detalle, perfil, galería y disponibilidad de habitaciones para alojamientos.",
	},
	{
		pattern: "/product/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Contenido, fotos, ubicación, detalles, reglas para huéspedes y vista previa antes de publicar.",
	},
	{
		pattern: "/rates/plans/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Superficies comerciales centradas en tarifas, precios y condiciones.",
	},
	{
		pattern: "/rates/restrictions",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Dominio profesional de reglas de venta para vendibilidad y evaluación de búsqueda.",
	},
	{
		pattern: "/rates/calendar",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Calendario operativo unificado para precio, cupo, vendibilidad, reglas de venta y condiciones aplicables.",
	},
	{
		pattern: "/rates/multi-calendar",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Herramienta Pro para operar muchas tarifas por fecha sin reemplazar el calendario individual.",
	},
	{
		pattern: "/pricing",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Compat redirect hacia /rates/calendar; no exponer en navegación primaria.",
	},
	{
		pattern: "/pricing/rules",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Enlace legacy redirigido a /rates/restrictions?tab=price; no exponer en navegación primaria.",
	},
	{
		pattern: "/pricing/calendar",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Superficie de calendario deprecada; no exponer en navegación primaria.",
	},
	{
		pattern: "/product/:id/rooms/:roomId/inventory",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Compat redirect hacia /rates/calendar con filtro de habitación y foco de disponibilidad.",
	},
	{
		pattern: "/inventory/bulk",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Compat redirect hacia /rates/calendar con foco de disponibilidad; las operaciones de cupo viven en Calendario.",
	},
	{
		pattern: "/inventory",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Compat redirect hacia /rates/calendar con foco de disponibilidad; no exponer como navegación primaria.",
	},
	{
		pattern: "/booking/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Reservations",
		rationale: "Ciclo de vida de reservas basado en instantáneas contractuales.",
	},
	{
		pattern: "/financial/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Operación financiera y conciliación con instantáneas seguras; no es contabilidad ni pasarela de pago.",
	},
	{
		pattern: "/provider/policies/audit",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale:
			"La auditoría de condiciones es gobernanza y trazabilidad, no operación diaria de tarifas.",
	},
	{
		pattern: "/provider/house-rules",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Reglas visibles para huéspedes; no son precios, reglas de venta ni condiciones de reserva.",
	},
	{
		pattern: "/provider/policies/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"La gestión de condiciones pertenece a Habitaciones y tarifas como contrato de reserva por tarifa.",
	},
	{
		pattern: "/provider/tax-fees",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Impuestos y cargos son configuración financiera-comercial, no ajustes genéricos del proveedor.",
	},
	{
		pattern: "/analytics/**",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Analytics & Performance",
		rationale: "Superficies iniciales de reporte; visibles como operación transicional.",
	},
	{
		pattern: "/system/integrations",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Connectivity",
		rationale: "Superficie inicial de conectividad; no es un contenedor genérico de sistema.",
	},
	{
		pattern: "/provider",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "Configuración de organización del proveedor.",
	},
	{
		pattern: "/provider/profile",
		status: "legacy",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "Legacy redirect to provider settings step.",
	},
	{
		pattern: "/provider/register",
		status: "legacy",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "Legacy redirect to provider onboarding step.",
	},
	{
		pattern: "/provider/verification",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "La verificación del proveedor pertenece a gobernanza, no a operación de sistema.",
	},
	{
		pattern: "/admin/**",
		status: "internal-only",
		context: "internal-admin",
		owner: "Internal Admin",
		rationale:
			"Superficie administrativa de plataforma; no pertenece a la navegación del proveedor.",
	},
	{
		pattern: "/api/internal/dashboard-summary",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Command Center",
		rationale: "Provider-facing BFF read model for the command center; legacy internal path.",
	},
	{
		pattern: "/api/internal/provider-summary",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "Provider-facing BFF read model for provider governance; legacy internal path.",
	},
	{
		pattern: "/api/internal/product-summary",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Provider-facing BFF read model for property content.",
	},
	{
		pattern: "/api/internal/rooms-summary",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Provider-facing BFF for accommodation room cards and room readiness.",
	},
	{
		pattern: "/api/internal/room-summary",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "BFF del espacio de habitación y preparación visible para huéspedes.",
	},
	{
		pattern: "/api/internal/variants-summary",
		status: "legacy",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Compatibility alias for the room-facing rooms-summary BFF.",
	},
	{
		pattern: "/api/internal/variant-summary",
		status: "legacy",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Compatibility alias for the room-facing room-summary BFF.",
	},
	{
		pattern: "/api/internal/availability-summary",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Provider-facing BFF read model for variant availability.",
	},
	{
		pattern: "/api/internal/inventory/recompute",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Provider-facing operational repair BFF; legacy internal path, not internal-only.",
	},
	{
		pattern: "/api/internal/provider-bookings-summary",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Reservations",
		rationale: "Provider-facing BFF read model for reservation operations.",
	},
	{
		pattern: "/api/internal/booking-summary",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Reservations",
		rationale: "Workspace BFF read model for booking detail.",
	},
	{
		pattern: "/api/internal/observability/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Operaciones internas / Observabilidad",
		rationale:
			"Los diagnósticos de observabilidad no deben ser destinos directos de navegación del proveedor.",
	},
	{
		pattern: "/api/internal/search/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Operaciones internas / Observabilidad",
		rationale: "Operaciones de búsqueda y salud quedan como superficies internas.",
	},
	{
		pattern: "/api/internal/inventory/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Operaciones internas / Observabilidad",
		rationale: "Diagnósticos y tareas de inventario quedan como superficies internas.",
	},
	{
		pattern: "/api/internal/financial/operations",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Provider-facing BFF read model for financial operations and reconciliation visibility.",
	},
	{
		pattern: "/api/internal/financial/exceptions/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Provider-facing BFF for persisted financial review workflow actions; not PSP execution.",
	},
	{
		pattern: "/api/internal/financial/exceptions",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Provider-facing BFF read model for persisted plus derived financial review overlay.",
	},
	{
		pattern: "/api/internal/financial/review-events",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale: "Provider-facing BFF read model for financial review audit timeline.",
	},
	{
		pattern: "/api/internal/financial/references",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Provider-facing BFF for financial evidence/reference visibility; not payment execution.",
	},
	{
		pattern: "/api/internal/financial/refund-handoffs/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale: "Provider-facing BFF for refund handoff review visibility; not refund execution.",
	},
	{
		pattern: "/api/internal/financial/reconciliation-queue",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Provider-facing BFF read model for Stage 3 reconciliation comparison visibility; not PSP execution.",
	},
	{
		pattern: "/api/internal/financial/reconciliation-matches/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Provider-facing BFF for marking reconciliation comparison review only; not financial finality.",
	},
	{
		pattern: "/api/internal/financial/transactions",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale: "Provider-facing BFF for persisted PSP evidence identity; not payment execution.",
	},
	{
		pattern: "/api/internal/financial/settlements",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"BFF visible para proveedor con evidencia de liquidación; no ejecuta pagos al proveedor.",
	},
	{
		pattern: "/api/internal/financial/provider-finance",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"BFF visible para proveedor con lectura financiera; no ejecuta pagos al proveedor ni contabilidad.",
	},
	{
		pattern: "/api/internal/financial/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Operaciones internas / Observabilidad",
		rationale:
			"Los diagnósticos financieros siguen como superficies internas hasta exponerse en la UX de finanzas.",
	},
	{
		pattern: "/api/internal/pricing/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Operaciones internas / Observabilidad",
		rationale: "Los diagnósticos de precios siguen como superficies internas.",
	},
	{
		pattern: "/api/internal/pricing-day-inspector",
		status: "internal-only",
		context: "internal-ops",
		owner: "Operaciones internas / Observabilidad",
		rationale: "El inspector diario de precios sigue como superficie interna de diagnóstico.",
	},
	{
		pattern: "/api/internal/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Operaciones internas / Observabilidad",
		rationale: "Las APIs internas no clasificadas quedan solo para operación interna.",
	},
	{
		pattern: "/api/admin/**",
		status: "internal-only",
		context: "internal-admin",
		owner: "Internal Admin",
		rationale: "Admin mutation APIs are internal governance surfaces.",
	},
	{
		pattern: "/api/auth/**",
		status: "public",
		context: "public-marketplace",
		owner: "Identity",
		rationale: "Authentication boundary shared by public and workspace access.",
	},
	{
		pattern: "/api/booking/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Reservations",
		rationale: "Booking lifecycle APIs.",
	},
	{
		pattern: "/api/inventory/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Physical inventory APIs; variant-first ownership is legitimate here.",
	},
	{
		pattern: "/api/pricing/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "RatePlan-first pricing APIs.",
	},
	{
		pattern: "/api/rateplans/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Rate plan management APIs.",
	},
	{
		pattern: "/api/rates/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Rate plan read APIs.",
	},
	{
		pattern: "/api/policies/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "APIs comerciales de condiciones.",
	},
	{
		pattern: "/api/provider/tax-fees/**",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale: "Tax and fee setup APIs.",
	},
	{
		pattern: "/api/provider/**",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "Provider organization APIs.",
	},
	{
		pattern: "/api/providers/**",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "Provider profile and verification APIs.",
	},
	{
		pattern: "/api/product/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Contenido de alojamiento",
		rationale: "APIs de contenido de ofertas.",
	},
	{
		pattern: "/api/products/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Contenido de alojamiento",
		rationale: "APIs de contenido, condiciones, servicios y oferta pública.",
	},
	{
		pattern: "/api/variant/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Physical variant management APIs.",
	},
	{
		pattern: "/api/search-v2",
		status: "public",
		context: "public-marketplace",
		owner: "Search",
		rationale: "Public read-only search API.",
	},
	{
		pattern: "/api/destinations",
		status: "public",
		context: "public-marketplace",
		owner: "Public Marketplace",
		rationale: "Public destination lookup API.",
	},
	{
		pattern: "/api/geocode",
		status: "transitional",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Provider content geocoding helper.",
	},
	{
		pattern: "/api/upload/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Provider content upload APIs.",
	},
	{
		pattern: "/api/uploads/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Provider content upload APIs.",
	},
	{
		pattern: "/404",
		status: "public",
		context: "public-marketplace",
		owner: "Public Marketplace",
		rationale: "Public error surface.",
	},
	{
		pattern: "/SignInPage",
		status: "public",
		context: "public-marketplace",
		owner: "Identity",
		rationale: "Authentication entry point.",
	},
	{
		pattern: "/auth/callback",
		status: "public",
		context: "public-marketplace",
		owner: "Identity",
		rationale: "Authentication callback.",
	},
	{
		pattern: "/",
		status: "public",
		context: "public-marketplace",
		owner: "Public Marketplace",
		rationale: "Consumer marketplace entry point.",
	},
	{
		pattern: "/hotels/**",
		status: "public",
		context: "public-marketplace",
		owner: "Public Marketplace",
		rationale: "Consumer hotel discovery and detail routes.",
	},
	{
		pattern: "/tours/**",
		status: "public",
		context: "public-marketplace",
		owner: "Public Marketplace",
		rationale: "Consumer tour discovery and detail routes.",
	},
	{
		pattern: "/packages/**",
		status: "public",
		context: "public-marketplace",
		owner: "Public Marketplace",
		rationale: "Consumer package discovery and detail routes.",
	},
]

export const enterpriseNavigation: EnterpriseNavigationSection[] = [
	{
		title: "Inicio",
		subtitle: "Resumen operativo",
		owner: "Operación",
		context: "enterprise-operations",
		operationalIntent:
			"Resumen de preparación, salud operativa y accesos frecuentes del proveedor.",
		maturity: "operational",
		items: [
			{
				label: "Resumen",
				href: routes.dashboard(),
				status: "canonical",
				summary: "Preparación del proveedor, avance de catálogo y accesos rápidos.",
			},
		],
	},
	{
		title: "Habitaciones y tarifas",
		subtitle: "Precios, inventario y venta",
		owner: "Operaciones comerciales",
		context: "enterprise-operations",
		operationalIntent:
			"Gestiona tarifas, calendario, condiciones y herramientas avanzadas de inventario, reglas de venta y operaciones masivas cuando el proveedor tiene escala.",
		maturity: "operational",
		items: [
			{
				label: "Tarifas",
				href: routes.ratePlansList(),
				status: "canonical",
				summary:
					"Tarifas comerciales vinculadas a habitaciones: precio base, condiciones y estado.",
			},
			{
				label: "Calendario",
				href: routes.pricing(),
				status: "canonical",
				summary: "Precio, cupo y venta diaria desde una superficie operativa.",
			},
			{
				label: "Condiciones",
				href: routes.providerPolicies(),
				status: "canonical",
				level: 2,
				summary:
					"Readiness real por tarifa: cancelación, pagos, no presentación, ingreso y salida.",
			},
			{
				label: "Multicalendario",
				href: routes.ratesMultiCalendar(),
				status: "canonical",
				level: 2,
				summary: "Vista Pro para operar varias tarifas y fechas sin entrar una por una.",
			},
			{
				label: "Reglas de venta",
				href: routes.rateRestrictions(),
				status: "canonical",
				level: 2,
				summary: "Estadía mínima, cierre de venta, llegada/salida permitida y ventana de reserva.",
			},
		],
	},
	{
		title: "Reservas",
		subtitle: "Ciclo de vida y seguimiento",
		owner: "Operación de reservas",
		context: "enterprise-operations",
		operationalIntent:
			"Coordinación del ciclo de vida de reservas con instantáneas contractuales, precios, inventario y pagos en sus dominios.",
		maturity: "operational",
		items: [
			{
				label: "Reservas",
				href: routes.bookingList(),
				status: "canonical",
				summary: "Llegadas, estadías, salidas, cancelaciones y seguimiento operativo.",
			},
		],
		planned: ["Cambios de reserva", "Relación con huéspedes", "Reembolsos"],
	},
	{
		title: "Catálogo de ofertas",
		subtitle: "Presentación, verticales y readiness",
		owner: "Property Content",
		context: "provider-workspace",
		operationalIntent:
			"Gestiona ofertas de catálogo: hoteles, tours y paquetes con contenido, fotos, ubicación, detalles y vista previa.",
		maturity: "operational",
		items: [
			{
				label: "Catálogo",
				href: routes.productList(),
				status: "canonical",
				summary:
					"Gestiona alojamientos, tours y paquetes con contenido, fotos, ubicación, detalles y vista previa. Alojamientos mantiene habitaciones como flujo físico propio.",
			},
			{
				label: "Habitaciones",
				href: routes.productRooms(),
				status: "canonical",
				summary: "Tipos de habitación, capacidad, fotos propias y contexto físico.",
			},
			{
				label: "Reglas para huéspedes",
				href: routes.providerHouseRules(),
				status: "canonical",
				summary:
					"Mascotas, fumar, horarios de silencio, llegada, salida y expectativas de estadía.",
			},
		],
		planned: ["Revisión de fotos", "Metadata SEO", "Flujo de calidad de contenido"],
	},
	{
		title: "Pagos y finanzas",
		subtitle: "Conciliación y visibilidad financiera",
		owner: "Finanzas",
		context: "enterprise-operations",
		operationalIntent:
			"Operación financiera para conciliación, reembolsos, pagos, comisiones, impuestos y cargos.",
		maturity: "transitional",
		items: [
			{
				label: "Operación financiera",
				href: routes.financialOperations(),
				status: "canonical",
				summary:
					"Instantáneas contractuales, visibilidad de pagos, reembolsos, comisiones y conciliación.",
			},
			{
				label: "Impuestos y cargos",
				href: routes.providerTaxFees(),
				status: "transitional",
				summary: "Configuración de cargos visibles para huéspedes.",
			},
		],
		planned: ["Pasarelas de pago", "Facturación", "Automatización de pagos"],
	},
	{
		title: "Analítica",
		subtitle: "Lectura operativa",
		owner: "Performance",
		context: "enterprise-operations",
		operationalIntent:
			"Reportes transicionales para leer rendimiento sin convertirlo en una plataforma analítica pesada.",
		maturity: "transitional",
		items: [
			{
				label: "Ingresos",
				href: routes.analyticsRevenue(),
				status: "transitional",
				summary: "Reporte inicial; no hay motor de revenue management activo.",
			},
			{
				label: "Rendimiento",
				href: routes.analyticsPerformance(),
				status: "transitional",
				summary: "KPIs iniciales; no es un módulo analítico avanzado.",
			},
			{
				label: "Ocupación",
				href: routes.analyticsOccupancy(),
				status: "transitional",
				summary: "Reporte inicial de ocupación.",
			},
		],
		planned: ["Revenue management", "Oportunidades"],
	},
	{
		title: "Conectividad",
		subtitle: "Sistemas externos e integraciones",
		owner: "Integraciones",
		context: "enterprise-operations",
		operationalIntent:
			"Superficie transicional para planificar integraciones; todavía no hay sync activo de canales.",
		maturity: "transitional",
		items: [
			{
				label: "Integraciones",
				href: routes.systemIntegrations(),
				status: "transitional",
				summary: "Planificación de conectores; channel sync todavía no está activo.",
			},
		],
		planned: ["Channel manager", "APIs de proveedor"],
	},
	{
		title: "Administración",
		subtitle: "Organización, verificación y controles",
		owner: "Gobernanza",
		context: "governance",
		operationalIntent: "Organización del proveedor, onboarding, verificación y controles.",
		maturity: "transitional",
		items: [
			{
				label: "Configuración",
				href: routes.provider(),
				status: "transitional",
				summary: "Configuración de organización mientras RBAC está planificado.",
			},
			{
				label: "Verificación",
				href: routes.providerVerification(),
				status: "transitional",
				summary: "Flujo de verificación del proveedor.",
			},
			{
				label: "Auditoría",
				href: routes.providerPoliciesAudit(),
				status: "transitional",
				summary: "Trazabilidad y resolución de condiciones para gobernanza.",
			},
		],
		planned: ["RBAC administrativo", "Operación de soporte"],
	},
]

function isAdvancedSidebarItem(item: EnterpriseNavigationItem): boolean {
	return [
		routes.rateRestrictions(),
		routes.ratesMultiCalendar(),
		routes.providerPoliciesAudit(),
	].includes(item.href)
}

function shouldShowSectionForDisclosure(
	section: EnterpriseNavigationSection,
	context: SidebarDisclosureContext
): boolean {
	if (context.mode !== "small-provider") return true
	return !["Analítica", "Conectividad"].includes(section.title)
}

function shouldShowItemForDisclosure(
	item: EnterpriseNavigationItem,
	context: SidebarDisclosureContext
): boolean {
	if (context.mode !== "small-provider") return true
	return !isAdvancedSidebarItem(item)
}

function shouldShowPlannedForDisclosure(context: SidebarDisclosureContext): boolean {
	return context.mode !== "small-provider"
}

function shouldShowSectionPlannedForDisclosure(
	section: EnterpriseNavigationSection,
	context: SidebarDisclosureContext
): boolean {
	if (section.title === "Habitaciones y tarifas") return false
	return shouldShowPlannedForDisclosure(context)
}

export function filterEnterpriseNavigationForDisclosure(
	sections: readonly EnterpriseNavigationSection[],
	context: SidebarDisclosureContext
): EnterpriseNavigationSection[] {
	return sections
		.filter((section) => shouldShowSectionForDisclosure(section, context))
		.map((section) => {
			const items = section.items.filter((item) => shouldShowItemForDisclosure(item, context))
			return {
				...section,
				items,
				planned: shouldShowSectionPlannedForDisclosure(section, context)
					? section.planned
					: undefined,
			}
		})
		.filter((section) => section.items.length > 0)
}

export const roomsAndRatesOperationalMap: readonly RoomsAndRatesOperationalLane[] = [
	{
		title: "Capa comercial de producto y precios",
		ownership: "commercial",
		status: "operational",
		intent:
			"Responsabilidad centrada en tarifas para productos comerciales, cobertura de precios, automatización de precios y traspasos comerciales.",
		surfaces: [
			{
				label: "Tarifas",
				href: routes.ratePlansList(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description:
					"Superficie explícita para mantener tarifas comerciales; precios por ocupación vive aquí como ajuste avanzado cuando esté disponible.",
			},
			{
				label: "Calendario",
				href: routes.pricing(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description:
					"Cobertura diaria de precios, brechas y edición rápida desde calendario; las reglas de precio pertenecen a este contexto.",
			},
			{
				label: "Multicalendario",
				href: routes.ratesMultiCalendar(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description:
					"Superficie Pro para revisar muchas tarifas por fecha y abrir acciones masivas sin reemplazar el calendario individual.",
			},
		],
	},
	{
		title: "Capa de inventario físico",
		ownership: "physical",
		status: "operational",
		intent:
			"Responsabilidad de inventario físico por habitación, disponibilidad y capacidad de unidades; la operación diaria de cupos se expone en Calendario.",
		surfaces: [
			{
				label: "Catálogo y habitaciones",
				href: routes.productList(),
				status: "canonical",
				owner: "Catálogo de ofertas",
				description:
					"Setup de catálogo; hoteles entregan habitaciones como contexto físico al inventario.",
			},
		],
	},
	{
		title: "Venta y condiciones de reserva",
		ownership: "commercial",
		status: "operational",
		intent:
			"Reglas de venta controla vendibilidad; Condiciones controla los términos contractuales de reserva. Ninguno es motor de precios.",
		surfaces: [
			{
				label: "Reglas de venta",
				href: routes.rateRestrictions(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description:
					"Dominio oficial para estadía mínima, cierres de llegada/salida, stop-sell, ventanas de reserva y reglas de vendibilidad.",
			},
			{
				label: "Condiciones",
				href: routes.providerPolicies(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description:
					"Biblioteca contractual para cancelación, pago, no presentación, ingreso y salida; auditoría vive dentro de cada condición y los impuestos/cargos se referencian solo cuando afectan reembolso.",
			},
		],
	},
] as const

export const plannedEnterpriseModules = [
	"Gestión de ingresos",
	"Marketing",
	"Relación con huéspedes / CRM",
	"Oportunidades",
	"Operación de soporte",
	"Consola de observabilidad",
	"Administración RBAC",
] as const

export function getBackofficeRouteClassification(
	pathname: string
): BackofficeRouteClassification | null {
	const cleanPath = pathname.split("?")[0]?.replace(/\/$/, "") || "/"
	for (const classification of backofficeRouteClassifications) {
		if (patternToRegExp(classification.pattern).test(cleanPath)) return classification
	}
	return null
}

export function getEnterpriseNavigationSection(
	pathname: string
): EnterpriseNavigationSection | null {
	const cleanPath = pathname.split("?")[0]?.replace(/\/$/, "") || "/"
	return (
		enterpriseNavigation.find((section) =>
			section.items.some((item) => {
				const href = item.href.replace(/\/$/, "") || "/"
				return cleanPath === href || cleanPath.startsWith(`${href}/`)
			})
		) ?? null
	)
}

export function getOperationalContextMetadata(
	context: OperationalContext | null | undefined
): OperationalContextMetadata {
	if (!context) return { label: "Workspace", description: "Enterprise backoffice surface." }
	return operationalContextMetadata[context]
}

export function getGovernanceStatusMetadata(
	status: GovernanceStatus | null | undefined
): GovernanceStatusMetadata {
	if (!status) {
		return {
			label: "Workspace",
			description: "Estado de gobernanza no disponible para esta superficie.",
			tone: "slate",
		}
	}
	return governanceStatusMetadata[status]
}
