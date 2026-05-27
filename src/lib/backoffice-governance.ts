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
		description: "Consumer-facing discovery and conversion surfaces.",
	},
	"provider-workspace": {
		label: "Provider Workspace",
		description: "Provider-owned content and physical product setup.",
	},
	"enterprise-operations": {
		label: "Enterprise Operations",
		description: "Commercial, reservation, finance, and operational control surfaces.",
	},
	"internal-admin": {
		label: "Internal Admin",
		description: "Platform-only administration and governance.",
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
		description: "Canonical workspace surface for current operations.",
		tone: "green",
	},
	"transitional": {
		label: "Transitional",
		description: "Real surface with governed scope; not yet the final enterprise module.",
		tone: "amber",
	},
	"legacy": {
		label: "Legacy",
		description: "Isolated compatibility surface; not primary navigation.",
		tone: "slate",
	},
	"internal-only": {
		label: "Internal Only",
		description: "Hidden from provider workspace navigation.",
		tone: "slate",
	},
	"public": {
		label: "Public",
		description: "Consumer or authentication surface.",
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
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Short client-first alias that forwards providers to the room selector.",
	},
	{
		pattern: "/product/:id/rooms",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Cliente-first room surface for one accommodation; technical variant routes remain compatibility internals.",
	},
	{
		pattern: "/product/:id/variants/**",
		status: "transitional",
		context: "provider-workspace",
		owner: "Physical Inventory Context",
		rationale:
			"Transitional physical variant workspace under the product tree; catalog may navigate here, but pricing and ARI ownership stay outside Property Content.",
	},
	{
		pattern: "/product/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Catalog content, media, location, metadata, House Rules, and guest-facing pre-publish review.",
	},
	{
		pattern: "/rates/plans/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "RatePlan-first commercial pricing and policy surfaces.",
	},
	{
		pattern: "/rates/restrictions",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Operational sellability domain over existing restriction rules and search evaluation.",
	},
	{
		pattern: "/pricing",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Calendar-first daily pricing operation over rate-plan ownership.",
	},
	{
		pattern: "/pricing/rules",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Legacy deep link redirected into /pricing#pricing-automation; do not expose as primary navigation.",
	},
	{
		pattern: "/pricing/calendar",
		status: "legacy",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Deprecated calendar surface; do not expose in primary navigation.",
	},
	{
		pattern: "/inventory/bulk",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Secondary bulk inventory tool; daily physical inventory ownership lives in /inventory.",
	},
	{
		pattern: "/inventory",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Calendar-first physical inventory operation; variant-first ownership is legitimate here.",
	},
	{
		pattern: "/booking/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Reservations",
		rationale: "Snapshot-driven reservation lifecycle.",
	},
	{
		pattern: "/financial/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Snapshot-safe financial operations and reconciliation visibility; not an accounting or PSP engine.",
	},
	{
		pattern: "/provider/policies/audit",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale:
			"Policy auditability is governance and traceability, not daily Rooms & Rates operation.",
	},
	{
		pattern: "/provider/house-rules",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale:
			"Guest behavior and property-use expectations; not pricing, restrictions, or booking contract terms.",
	},
	{
		pattern: "/provider/policies/**",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale:
			"Booking policy management belongs under Rooms & Rates as rate-plan booking conditions.",
	},
	{
		pattern: "/provider/tax-fees",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale: "Taxes and fees are financial-commercial setup, not generic provider settings.",
	},
	{
		pattern: "/analytics/**",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Analytics & Performance",
		rationale: "Placeholder reporting surfaces; visible as transitional operations.",
	},
	{
		pattern: "/system/integrations",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Connectivity",
		rationale: "Connectivity placeholder; not a generic System bucket.",
	},
	{
		pattern: "/provider",
		status: "transitional",
		context: "governance",
		owner: "Administration & Governance",
		rationale: "Provider organization settings.",
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
		rationale: "Provider verification belongs to governance, not operational System.",
	},
	{
		pattern: "/admin/**",
		status: "internal-only",
		context: "internal-admin",
		owner: "Internal Admin",
		rationale: "Platform governance/admin surface; not provider workspace navigation.",
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
		pattern: "/api/internal/variants-summary",
		status: "transitional",
		context: "provider-workspace",
		owner: "Physical Inventory Context",
		rationale:
			"Provider-facing BFF for transitional physical variant context under the product tree.",
	},
	{
		pattern: "/api/internal/variant-summary",
		status: "transitional",
		context: "provider-workspace",
		owner: "Physical Inventory Context",
		rationale:
			"Provider-facing BFF for a transitional physical variant surface; not catalog editorial ownership.",
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
		rationale: "Provider-facing BFF for settlement evidence visibility; not payout execution.",
	},
	{
		pattern: "/api/internal/financial/provider-finance",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Payments & Finance",
		rationale:
			"Provider-facing BFF read model for provider finance visibility; not payout execution or accounting.",
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
		rationale: "Commercial policy APIs.",
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
		pattern: "/api/house-rules/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Property content house-rule APIs.",
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
				summary: "Preparación del proveedor, avance de alojamientos y accesos rápidos.",
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
				summary: "Cancelación, pagos, no-show, check-in y check-out.",
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
			"Coordinación del ciclo de vida de reservas con snapshots de contrato, precios, inventario y pagos en sus dominios.",
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
		title: "Contenido del alojamiento",
		subtitle: "Presentación, habitaciones y reglas",
		owner: "Contenido",
		context: "provider-workspace",
		operationalIntent:
			"Gestiona alojamientos, habitaciones, fotos, ubicación, detalles y reglas visibles para huéspedes.",
		maturity: "operational",
		items: [
			{
				label: "Alojamientos",
				href: routes.productList(),
				status: "canonical",
				summary: "Contenido, fotos, ubicación, detalles y vista previa del alojamiento.",
			},
			{
				label: "Habitaciones",
				href: routes.productRooms(),
				status: "canonical",
				summary: "Tipos de habitación, capacidad, fotos propias y contexto físico.",
			},
			{
				label: "Reglas de la casa",
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
					"Snapshots de contrato, visibilidad de pagos, reembolsos, comisiones y conciliación.",
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
		title: "Commercial product and pricing layer",
		ownership: "commercial",
		status: "operational",
		intent:
			"RatePlan-first ownership for commercial products, price coverage, pricing automation, and commercial handoffs.",
		surfaces: [
			{
				label: "Tarifas",
				href: routes.ratePlansList(),
				status: "canonical",
				owner: "Rooms & Rates",
				description: "Explicit rate-plan maintenance surface for commercial products.",
			},
			{
				label: "Calendario de precios",
				href: routes.pricing(),
				status: "canonical",
				owner: "Rooms & Rates",
				description: "Calendar-first daily pricing coverage, gaps, and quick price edits.",
			},
		],
	},
	{
		title: "Physical inventory layer",
		ownership: "physical",
		status: "operational",
		intent:
			"Variant-first physical inventory ownership for room types, availability, and unit capacity.",
		surfaces: [
			{
				label: "Alojamientos y habitaciones",
				href: routes.productList(),
				status: "canonical",
				owner: "Contenido del alojamiento",
				description:
					"Setup de alojamiento y habitaciones que entrega contexto físico al inventario.",
			},
			{
				label: "Inventario",
				href: routes.inventory(),
				status: "canonical",
				owner: "Rooms & Rates",
				description: "Calendar-first physical capacity, availability, and unit counts by variant.",
			},
			{
				label: "Bulk Inventory",
				href: routes.inventoryBulk(),
				status: "transitional",
				owner: "Rooms & Rates",
				description:
					"Contextual advanced workflow for exceptional physical-capacity operations launched from Inventory.",
			},
		],
	},
	{
		title: "Sellability and booking conditions",
		ownership: "commercial",
		status: "operational",
		intent:
			"Restrictions own sellability while booking policies own reservation contract terms; neither is a pricing engine.",
		surfaces: [
			{
				label: "Restricciones de venta",
				href: routes.rateRestrictions(),
				status: "canonical",
				owner: "Rooms & Rates",
				description:
					"Official sellability domain for LOS, CTA/CTD, stop-sell, and booking-window controls.",
			},
			{
				label: "Condiciones",
				href: routes.providerPolicies(),
				status: "transitional",
				owner: "Rooms & Rates",
				description:
					"Booking contract library for cancellation, payment, no-show, and check-in/out terms.",
			},
			{
				label: "Taxes & Fees",
				href: routes.providerTaxFees(),
				status: "transitional",
				owner: "Payments & Finance",
				description: "Financial-commercial charges surfaced as a governed cross-owner dependency.",
			},
		],
	},
	{
		title: "ARI maturity roadmap",
		ownership: "planned",
		status: "planned",
		intent:
			"Roadmap markers only. These are not active workspaces until real ownership and routes exist.",
		surfaces: [
			{
				label: "Occupancy Pricing",
				status: "planned",
				owner: "Rooms & Rates",
				description: "Future occupancy pricing management over rate-plan semantics.",
			},
			{
				label: "Audit History",
				status: "planned",
				owner: "Rooms & Rates",
				description: "Future ARI audit history surface.",
			},
		],
	},
] as const

export const plannedEnterpriseModules = [
	"Revenue Management",
	"Marketing",
	"Guest Relations / CRM",
	"Opportunities",
	"Support Operations",
	"Observability Console",
	"Administration RBAC",
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
			description: "Governance status unavailable for this surface.",
			tone: "slate",
		}
	}
	return governanceStatusMetadata[status]
}
