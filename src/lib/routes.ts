export const routes = {
	home: () => "/",
	dashboard: () => "/dashboard",
	provider: () => "/provider",
	providerPolicies: () => "/provider/policies",
	providerPoliciesAudit: () => "/provider/policies/audit",
	providerHouseRules: () => "/provider/house-rules",
	providerTaxFees: () => "/provider/tax-fees",
	providerVerification: () => "/provider/verification",
	productList: () => "/product",
	bookingList: () => "/booking",
	financialOperations: () => "/financial",
	ratePlansHub: () => "/rates/plans",
	ratePlansList: () => "/rates/plans/manage",
	rateRestrictions: () => "/rates/restrictions",
	ratePlanPolicies: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}/policies`,
	ratePlanPricing: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}/pricing`,
	ratePlanDetail: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}`,
	pricing: () => "/pricing",
	pricingAutomation: () => "/pricing#pricing-automation",
	inventory: () => "/inventory",
	inventoryBulk: () => "/inventory/bulk",
	analyticsPerformance: () => "/analytics/performance",
	analyticsRevenue: () => "/analytics/revenue",
	analyticsOccupancy: () => "/analytics/occupancy",
	systemIntegrations: () => "/system/integrations",
	productDetail: (productId: string) => `/product/${encodeURIComponent(String(productId))}`,
	productPreview: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/preview`,
	productVariants: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants`,
	variantDetail: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}`,
}

export type Routes = typeof routes
