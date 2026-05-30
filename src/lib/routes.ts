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
	productListByType: (productType: string) =>
		`/product?type=${encodeURIComponent(String(productType))}`,
	catalogAccommodations: () => "/catalog/accommodations",
	catalogAccommodationRooms: () => "/catalog/accommodations/rooms",
	catalogTours: () => "/catalog/tours",
	catalogPackages: () => "/catalog/packages",
	productRooms: () => "/catalog/accommodations/rooms",
	productRoomsForProduct: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms`,
	productRoomNew: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/new`,
	productRoomDetail: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}`,
	productRoomCapacity: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}/capacity`,
	productRoomSubtype: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}/subtype`,
	productRoomAvailability: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}/availability`,
	productRoomInventory: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}/inventory`,
	bookingList: () => "/booking",
	financialOperations: () => "/financial",
	ratePlansList: () => "/rates/plans/manage",
	rateRestrictions: () => "/rates/restrictions",
	ratePlanPolicies: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}/policies`,
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
