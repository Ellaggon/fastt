export const routes = {
	home: () => "/",
	dashboard: () => "/dashboard",
	provider: () => "/provider",
	providerPolicies: () => "/provider/policies",
	providerPoliciesAudit: () => "/provider/policies/audit",
	productList: () => "/product",
	bookingList: () => "/booking",
	ratePlansHub: () => "/rates/plans",
	ratePlanPolicies: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}/policies`,
	ratePlanPricing: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}/pricing`,
	ratePlanDetail: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}`,
	pricingRules: () => "/pricing/rules",
	pricingBulk: () => "/pricing/bulk",
	pricingCalendar: () => "/pricing/calendar",
	inventoryBulk: () => "/inventory/bulk",
	analyticsPerformance: () => "/analytics/performance",
	analyticsRevenue: () => "/analytics/revenue",
	analyticsOccupancy: () => "/analytics/occupancy",
	systemIntegrations: () => "/system/integrations",
	catalog: () => "/catalog",
	productDetail: (productId: string) => `/product/${encodeURIComponent(String(productId))}`,
	productVariants: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants`,
	variantDetail: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}`,
	variantPricing: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}/pricing`,
	variantPricingCalendar: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}/pricing/calendar`,
	variantPricingSeasons: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}/pricing/seasons`,
	variantPricingPromotions: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}/pricing/promotions`,
	variantPricingOverrides: (productId: string, variantId: string) =>
		`/product/${encodeURIComponent(String(productId))}/variants/${encodeURIComponent(String(variantId))}/pricing/overrides`,
}

export type Routes = typeof routes
