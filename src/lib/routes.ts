export const routes = {
	home: () => "/",
	dashboard: () => "/dashboard",
	provider: () => "/provider",
	providerPolicies: () => "/provider/policies",
	providerPoliciesAudit: () => "/provider/policies/audit",
	providerTaxFees: () => "/provider/tax-fees",
	providerVerification: () => "/provider/verification",
	productList: () => "/product",
	bookingList: () => "/booking",
	financialOperations: () => "/financial",
	ratePlansHub: () => "/rates/plans",
	ratePlanPolicies: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}/policies`,
	ratePlanPricing: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}/pricing`,
	ratePlanDetail: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}`,
	pricingRules: () => "/pricing/rules",
	pricingBulk: () => "/pricing/bulk",
	inventoryBulk: () => "/inventory/bulk",
	analyticsPerformance: () => "/analytics/performance",
	analyticsRevenue: () => "/analytics/revenue",
	analyticsOccupancy: () => "/analytics/occupancy",
	systemIntegrations: () => "/system/integrations",
	productDetail: (productId: string) => `/product/${encodeURIComponent(String(productId))}`,
	productVariants: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants`,
	variantDetail: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}`,
}

export type Routes = typeof routes
