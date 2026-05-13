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
		pattern: "/product/**",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Catalog/content and physical variant context.",
	},
	{
		pattern: "/rates/plans/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "RatePlan-first commercial pricing and policy surfaces.",
	},
	{
		pattern: "/pricing/bulk",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Operational bulk pricing surface over rate plans.",
	},
	{
		pattern: "/pricing/rules",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Advanced pricing action hub; subordinate to rate plan pricing.",
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
		status: "canonical",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Physical inventory operation; variant-first is legitimate here.",
	},
	{
		pattern: "/booking/**",
		status: "canonical",
		context: "enterprise-operations",
		owner: "Reservations",
		rationale: "Snapshot-driven reservation lifecycle.",
	},
	{
		pattern: "/provider/policies/**",
		status: "transitional",
		context: "enterprise-operations",
		owner: "Rooms & Rates",
		rationale: "Policy management belongs under commercial Rooms & Rates governance.",
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
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Provider-facing BFF read model for physical variants.",
	},
	{
		pattern: "/api/internal/variant-summary",
		status: "canonical",
		context: "provider-workspace",
		owner: "Property Content",
		rationale: "Provider-facing BFF read model for a physical variant.",
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
		title: "Command Center",
		subtitle: "Operational control",
		owner: "Enterprise Operations",
		context: "enterprise-operations",
		operationalIntent:
			"Control center for provider readiness, operational health, and high-priority workflows.",
		maturity: "operational",
		items: [
			{
				label: "Overview",
				href: routes.dashboard(),
				status: "canonical",
				summary: "Provider readiness, catalog progress, and operational shortcuts.",
			},
		],
	},
	{
		title: "Rooms & Rates",
		subtitle: "ARI, rate plans, inventory, policies",
		owner: "Commercial Operations",
		context: "enterprise-operations",
		operationalIntent:
			"ARI operating core separating commercial rate-plan control from physical inventory operations.",
		maturity: "operational",
		nextMaturity:
			"Rooms & Rates is the enterprise ARI hub: rate plans own commercial pricing while inventory remains physical and variant-first.",
		items: [
			{
				label: "Rooms & Rates Hub",
				href: routes.ratePlansHub(),
				status: "canonical",
				summary: "Enterprise ARI hub for commercial and physical operating lanes.",
			},
			{
				label: "Bulk Pricing",
				href: routes.pricingBulk(),
				status: "canonical",
				summary: "RatePlan-first bulk pricing operations.",
			},
			{
				label: "Bulk Inventory",
				href: routes.inventoryBulk(),
				status: "canonical",
				summary: "Physical inventory operations; variant-first ownership is intentional.",
			},
			{
				label: "Rules / Overrides",
				href: routes.pricingRules(),
				status: "transitional",
				level: 2,
				summary: "Advanced pricing rule management while rate plan surfaces remain canonical.",
			},
			{
				label: "Cancellation Policies",
				href: routes.providerPolicies(),
				status: "transitional",
				level: 2,
				summary: "Policy library awaiting full Rooms & Rates surface consolidation.",
			},
			{
				label: "Policy Audit",
				href: routes.providerPoliciesAudit(),
				status: "transitional",
				level: 2,
				summary: "Policy auditability surface for commercial governance.",
			},
		],
		planned: ["ARI Summary", "Restrictions", "Occupancy Pricing", "Audit History"],
	},
	{
		title: "Reservations",
		subtitle: "Snapshot-driven booking operations",
		owner: "Booking Operations",
		context: "enterprise-operations",
		operationalIntent: "Reservation lifecycle workspace anchored on immutable booking snapshots.",
		maturity: "operational",
		items: [
			{
				label: "Reservations",
				href: routes.bookingList(),
				status: "canonical",
				summary: "Snapshot-driven reservation lifecycle.",
			},
		],
	},
	{
		title: "Property Content",
		subtitle: "Catalog and physical product context",
		owner: "Catalog Operations",
		context: "provider-workspace",
		operationalIntent:
			"Provider-owned catalog content, media, location, services, and physical room context.",
		maturity: "operational",
		items: [
			{
				label: "Products & Room Types",
				href: routes.productList(),
				status: "canonical",
				summary: "Catalog content and physical variant context.",
			},
		],
	},
	{
		title: "Payments & Finance",
		subtitle: "Commercial charges and financial setup",
		owner: "Financial Operations",
		context: "enterprise-operations",
		operationalIntent:
			"Financial setup for taxes and guest-facing charges; payment lifecycle is not active yet.",
		maturity: "transitional",
		items: [
			{
				label: "Taxes & Fees",
				href: routes.providerTaxFees(),
				status: "transitional",
				summary: "Financial setup surface; payments console is not active yet.",
			},
		],
		planned: ["Payments Console", "Reconciliation Workspace"],
	},
	{
		title: "Analytics & Performance",
		subtitle: "Operational intelligence",
		owner: "Performance Operations",
		context: "enterprise-operations",
		operationalIntent:
			"Transitional reporting surfaces that identify future performance workflows without implying a mature analytics platform.",
		maturity: "transitional",
		items: [
			{
				label: "Revenue",
				href: routes.analyticsRevenue(),
				status: "transitional",
				summary: "Placeholder reporting surface; no revenue engine is active.",
			},
			{
				label: "Performance",
				href: routes.analyticsPerformance(),
				status: "transitional",
				summary: "Placeholder KPI surface; not an advanced analytics module.",
			},
			{
				label: "Occupancy",
				href: routes.analyticsOccupancy(),
				status: "transitional",
				summary: "Placeholder occupancy reporting surface.",
			},
		],
		planned: ["Revenue Management", "Opportunities"],
	},
	{
		title: "Connectivity",
		subtitle: "External systems and integrations",
		owner: "Connectivity Operations",
		context: "enterprise-operations",
		operationalIntent:
			"Transitional integration planning surface; no channel sync runtime is active from this workspace.",
		maturity: "transitional",
		items: [
			{
				label: "Integrations",
				href: routes.systemIntegrations(),
				status: "transitional",
				summary: "Connector planning surface; channel sync runtime is not active.",
			},
		],
		planned: ["Channel Manager", "Provider APIs"],
	},
	{
		title: "Administration & Governance",
		subtitle: "Organization, verification, controls",
		owner: "Platform Governance",
		context: "governance",
		operationalIntent: "Provider organization, onboarding, verification, and governance controls.",
		maturity: "transitional",
		items: [
			{
				label: "Provider Settings",
				href: routes.provider(),
				status: "transitional",
				summary: "Provider organization settings while RBAC is planned.",
			},
			{
				label: "Verification",
				href: routes.providerVerification(),
				status: "transitional",
				summary: "Provider verification workflow.",
			},
		],
		planned: ["Administration RBAC", "Support Operations"],
	},
]

export const roomsAndRatesOperationalMap: readonly RoomsAndRatesOperationalLane[] = [
	{
		title: "Commercial rate plan layer",
		ownership: "commercial",
		status: "operational",
		intent:
			"RatePlan-first commercial ownership for pricing, selling conditions, and tariff readiness.",
		surfaces: [
			{
				label: "Rooms & Rates Hub",
				href: routes.ratePlansHub(),
				status: "canonical",
				owner: "Rooms & Rates",
				description: "Operational command surface for rate plans and ARI readiness.",
			},
			{
				label: "Bulk Pricing",
				href: routes.pricingBulk(),
				status: "canonical",
				owner: "Rooms & Rates",
				description: "Bulk commercial pricing operations over explicit rate plans.",
			},
			{
				label: "Rules / Overrides",
				href: routes.pricingRules(),
				status: "transitional",
				owner: "Rooms & Rates",
				description: "Advanced pricing rule surface governed under rate-plan ownership.",
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
				label: "Products & Room Types",
				href: routes.productList(),
				status: "canonical",
				owner: "Property Content",
				description: "Catalog and room-type setup that provides physical context for inventory.",
			},
			{
				label: "Bulk Inventory",
				href: routes.inventoryBulk(),
				status: "canonical",
				owner: "Rooms & Rates",
				description: "Bulk physical inventory operations; variant-first ownership is intentional.",
			},
		],
	},
	{
		title: "Commercial conditions",
		ownership: "commercial",
		status: "transitional",
		intent:
			"Governed selling conditions that support rate-plan readiness without becoming pricing engines.",
		surfaces: [
			{
				label: "Cancellation Policies",
				href: routes.providerPolicies(),
				status: "transitional",
				owner: "Rooms & Rates",
				description: "Policy library awaiting deeper Rooms & Rates consolidation.",
			},
			{
				label: "Policy Audit",
				href: routes.providerPoliciesAudit(),
				status: "transitional",
				owner: "Rooms & Rates",
				description: "Policy auditability surface for commercial governance.",
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
				label: "ARI Summary",
				status: "planned",
				owner: "Rooms & Rates",
				description: "Future cross-lane operating summary.",
			},
			{
				label: "Restrictions",
				status: "planned",
				owner: "Rooms & Rates",
				description: "Future restriction workspace; no runtime channel manager exists yet.",
			},
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
