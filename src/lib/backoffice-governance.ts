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

export type RoomsAndRatesOwnership = "commercial" | "physical" | "financial" | "planned"

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
		status: "legacy",
		context: "internal-admin",
		rule: "Legacy shell kept only as isolated debt; no page may import it.",
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
		label: "Provider Workspace",
		description: "Provider-managed content and physical configuration surfaces.",
	},
	"enterprise-operations": {
		label: "Enterprise Operations",
		description: "Commercial, reservation, finance, and operational control surfaces.",
	},
	"internal-admin": {
		label: "Internal Admin",
		description: "Platform-only administration and governance surfaces.",
	},
	"internal-ops": {
		label: "Internal Ops",
		description: "Diagnostics, observability, and operational tooling.",
	},
	"governance": {
		label: "Governance",
		description: "Provider organization, verification, and control surfaces.",
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
		owner: "Property Content",
		rationale: "Legacy catalog route that redirects to the accommodation rooms workspace.",
	},
	{
		pattern: "/catalog/accommodations/rooms",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Accommodation-only room selector; rooms belong to Hotel/accommodation verticals, not generic Product.",
	},
	{
		pattern: "/catalog/accommodations",
		status: "transitional",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Vertical alias that opens the catalog filtered to accommodations while Product remains the generic catalog root.",
	},
	{
		pattern: "/catalog/tours",
		status: "transitional",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Vertical alias that opens the catalog filtered to tours while Product remains the generic catalog root.",
	},
	{
		pattern: "/catalog/packages",
		status: "transitional",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Vertical alias that opens the catalog filtered to packages while Product remains the generic catalog root.",
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
		rationale: "Official sellability domain for restriction rules and search evaluation.",
	},
	{
		pattern: "/pricing",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Operación diaria de precios desde calendario sobre responsabilidad de tarifas.",
	},
	{
		pattern: "/pricing/rules",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Enlace legacy redirigido a /pricing#pricing-automation; no exponer en navegación primaria.",
	},
	{
		pattern: "/pricing/calendar",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Superficie de calendario deprecada; no exponer en navegación primaria.",
	},
	{
		pattern: "/inventory/bulk",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Contextual advanced workflow for bulk physical inventory operations; daily operation lives in /inventory.",
	},
	{
		pattern: "/inventory",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Operación de inventario físico desde calendario; la responsabilidad por habitación vive aquí.",
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
			"Reglas visibles para huéspedes; no son precios, restricciones ni condiciones de reserva.",
	},
	{
		pattern: "/provider/policies/**",
		status: "transitional",
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
		owner: "Internal Ops / Observability",
		rationale:
			"Observability diagnostics must not be direct provider workspace navigation targets.",
	},
	{
		pattern: "/api/internal/search/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Internal Ops / Observability",
		rationale: "Search operations and health endpoints remain internal operations surfaces.",
	},
	{
		pattern: "/api/internal/inventory/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Internal Ops / Observability",
		rationale: "Inventory diagnostics and jobs remain internal operations surfaces.",
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
		owner: "Internal Ops / Observability",
		rationale:
			"Financial diagnostics remain internal operations surfaces until exposed via finance UX.",
	},
	{
		pattern: "/api/internal/pricing/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Internal Ops / Observability",
		rationale: "Pricing diagnostics remain internal operations surfaces.",
	},
	{
		pattern: "/api/internal/pricing-day-inspector",
		status: "internal-only",
		context: "internal-ops",
		owner: "Internal Ops / Observability",
		rationale: "Pricing day inspector remains an internal diagnostic surface.",
	},
	{
		pattern: "/api/internal/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Internal Ops / Observability",
		rationale: "Unclassified internal APIs default to internal operations only.",
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
		owner: "Property Content",
		rationale: "Product content APIs.",
	},
	{
		pattern: "/api/products/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Product content, policies, services, and public offer APIs.",
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
			"Gestiona tarifas, calendario de precios, inventario, restricciones de venta y condiciones.",
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
				label: "Calendario de precios",
				href: routes.pricing(),
				status: "canonical",
				summary: "Cambios manuales diarios, rango visible y ayudas recurrentes.",
			},
			{
				label: "Inventario",
				href: routes.inventory(),
				status: "canonical",
				summary: "Capacidad física disponible por día y ajustes rápidos de cupo.",
			},
			{
				label: "Restricciones de venta",
				href: routes.rateRestrictions(),
				status: "canonical",
				summary: "Reglas de venta: estadía mínima, cierres, llegada/salida y ventanas de reserva.",
			},
			{
				label: "Condiciones",
				href: routes.providerPolicies(),
				status: "transitional",
				level: 2,
				summary:
					"12 tarifas: 9 listas, 3 incompletas. Cancelación, pagos, no presentación, ingreso y salida.",
			},
		],
		planned: ["Pricing por ocupación", "Historial de auditoría"],
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
				label: "Auditoría de condiciones",
				href: routes.providerPoliciesAudit(),
				status: "transitional",
				summary: "Trazabilidad y resolución de condiciones para gobernanza.",
			},
		],
		planned: ["RBAC administrativo", "Operación de soporte"],
	},
]

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
				description: "Superficie explícita para mantener tarifas comerciales.",
			},
			{
				label: "Calendario de precios",
				href: routes.pricing(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description: "Cobertura diaria de precios, brechas y edición rápida desde calendario.",
			},
		],
	},
	{
		title: "Capa de inventario físico",
		ownership: "physical",
		status: "operational",
		intent:
			"Responsabilidad de inventario físico por habitación, disponibilidad y capacidad de unidades.",
		surfaces: [
			{
				label: "Catálogo y habitaciones",
				href: routes.productList(),
				status: "canonical",
				owner: "Catálogo de ofertas",
				description:
					"Setup de catálogo; hoteles entregan habitaciones como contexto físico al inventario.",
			},
			{
				label: "Inventario",
				href: routes.inventory(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description: "Capacidad física, disponibilidad y unidades por habitación desde calendario.",
			},
			{
				label: "Inventario masivo",
				href: routes.inventoryBulk(),
				status: "transitional",
				owner: "Habitaciones y tarifas",
				description:
					"Flujo avanzado contextual para operaciones excepcionales de capacidad física desde Inventario.",
			},
		],
	},
	{
		title: "Venta y condiciones de reserva",
		ownership: "commercial",
		status: "operational",
		intent:
			"Restricciones controla la venta; Condiciones controla los términos contractuales de reserva. Ninguno es motor de precios.",
		surfaces: [
			{
				label: "Restricciones de venta",
				href: routes.rateRestrictions(),
				status: "canonical",
				owner: "Habitaciones y tarifas",
				description:
					"Dominio oficial para estadía mínima, cierres de llegada/salida, stop-sell y ventanas de reserva.",
			},
			{
				label: "Condiciones",
				href: routes.providerPolicies(),
				status: "transitional",
				owner: "Habitaciones y tarifas",
				description:
					"Biblioteca contractual para cancelación, pago, no presentación, ingreso y salida.",
			},
			{
				label: "Impuestos y cargos",
				href: routes.providerTaxFees(),
				status: "transitional",
				owner: "Pagos y finanzas",
				description: "Cargos financieros y comerciales como dependencia gobernada entre áreas.",
			},
		],
	},
	{
		title: "Hoja de ruta de madurez de tarifas e inventario",
		ownership: "planned",
		status: "planned",
		intent:
			"Marcadores de hoja de ruta. No son espacios activos hasta tener responsabilidad y rutas reales.",
		surfaces: [
			{
				label: "Precios por ocupación",
				status: "planned",
				owner: "Habitaciones y tarifas",
				description: "Gestión futura de precios por ocupación sobre tarifas.",
			},
			{
				label: "Historial de auditoría",
				status: "planned",
				owner: "Habitaciones y tarifas",
				description: "Superficie futura de auditoría de tarifas e inventario.",
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
