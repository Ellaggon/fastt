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
}

export type EnterpriseNavigationSection = {
	title: string
	subtitle: string
	owner: string
	items: EnterpriseNavigationItem[]
}

export const backofficeShells: BackofficeShellClassification[] = [
	{
		shell: "WorkspaceLayout",
		status: "canonical",
		context: "enterprise-operations",
		rule: "Canonical shell for provider workspace and enterprise operational surfaces.",
	},
	{
		shell: "DashboardLayout",
		status: "legacy",
		context: "internal-admin",
		rule: "Legacy dashboard shell; do not use for new provider-facing enterprise operations.",
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
		rule: "Base shell for auth/public/simple pages; not a full enterprise workspace shell.",
	},
]

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
		pattern: "/api/internal/**",
		status: "internal-only",
		context: "internal-ops",
		owner: "Internal Ops / Observability",
		rationale: "Operational APIs and diagnostics must not be direct operator navigation targets.",
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
		items: [{ label: "Overview", href: routes.dashboard(), status: "canonical" }],
	},
	{
		title: "Rooms & Rates",
		subtitle: "ARI, rate plans, inventory, policies",
		owner: "Commercial Operations",
		items: [
			{ label: "Rate Plans", href: routes.ratePlansHub(), status: "canonical" },
			{ label: "Bulk Pricing", href: routes.pricingBulk(), status: "canonical" },
			{ label: "Bulk Inventory", href: routes.inventoryBulk(), status: "canonical" },
			{ label: "Rules / Overrides", href: routes.pricingRules(), status: "transitional", level: 2 },
			{
				label: "Cancellation Policies",
				href: routes.providerPolicies(),
				status: "transitional",
				level: 2,
			},
			{
				label: "Policy Audit",
				href: routes.providerPoliciesAudit(),
				status: "transitional",
				level: 2,
			},
		],
	},
	{
		title: "Reservations",
		subtitle: "Snapshot-driven booking operations",
		owner: "Booking Operations",
		items: [{ label: "Reservations", href: routes.bookingList(), status: "canonical" }],
	},
	{
		title: "Property Content",
		subtitle: "Catalog and physical product context",
		owner: "Catalog Operations",
		items: [{ label: "Products & Room Types", href: routes.productList(), status: "canonical" }],
	},
	{
		title: "Payments & Finance",
		subtitle: "Commercial charges and financial setup",
		owner: "Financial Operations",
		items: [{ label: "Taxes & Fees", href: routes.providerTaxFees(), status: "transitional" }],
	},
	{
		title: "Analytics & Performance",
		subtitle: "Operational intelligence",
		owner: "Performance Operations",
		items: [
			{ label: "Revenue", href: routes.analyticsRevenue(), status: "transitional" },
			{ label: "Performance", href: routes.analyticsPerformance(), status: "transitional" },
			{ label: "Occupancy", href: routes.analyticsOccupancy(), status: "transitional" },
		],
	},
	{
		title: "Connectivity",
		subtitle: "External systems and integrations",
		owner: "Connectivity Operations",
		items: [{ label: "Integrations", href: routes.systemIntegrations(), status: "transitional" }],
	},
	{
		title: "Administration & Governance",
		subtitle: "Organization, verification, controls",
		owner: "Platform Governance",
		items: [
			{ label: "Provider Settings", href: routes.provider(), status: "transitional" },
			{ label: "Verification", href: routes.providerVerification(), status: "transitional" },
		],
	},
]

export const plannedEnterpriseModules = [
	"Revenue Management",
	"Marketing",
	"Guest Relations / CRM",
	"Opportunities",
	"Support Operations",
	"Observability Console",
	"Administration RBAC",
] as const
