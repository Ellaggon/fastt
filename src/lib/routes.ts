export const routes = {
	home: () => "/",
	dashboard: () => "/dashboard",
	settings: () => "/provider",
	provider: () => "/provider",
	verification: () => "/provider/verification",
	providerHouseRules: () => "/provider/house-rules",
	taxFees: () => "/provider/tax-fees",
	providerTaxFees: () => "/provider/tax-fees",
	providerVerification: () => "/provider/verification",
	accommodations: () => "/product",
	productList: () => "/product",
	productListByType: (productType: string) =>
		`/product?type=${encodeURIComponent(String(productType))}`,
	catalogAccommodations: () => "/catalog/accommodations",
	catalogAccommodationRooms: () => "/catalog/accommodations/rooms",
	catalogTours: () => "/catalog/tours",
	catalogPackages: () => "/catalog/packages",
	rooms: () => "/catalog/accommodations/rooms",
	productRooms: () => "/catalog/accommodations/rooms",
	productRoomsForProduct: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms`,
	productRoomNew: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/new`,
	productRoomDetail: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}`,
	productRoomProfile: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}/profile`,
	productRoomAvailability: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}#disponibilidad`,
	productRoomInventory: (_productId: string, roomId: string) =>
		`/rates/calendar?variantId=${encodeURIComponent(String(roomId))}&focus=availability`,
	bookingList: () => "/booking",
	rates: () => "/rates/plans/manage",
	financialOperations: () => "/financial",
	financialCollections: () => "/financial/collections",
	financialSettlements: () => "/financial/settlements",
	financialProviderPayables: () => "/financial/provider-payables",
	financialRefunds: () => "/financial/refunds",
	financialExceptions: () => "/financial/exceptions",
	ratePlansList: () => "/rates/plans/manage",
	calendar: () => "/rates/calendar",
	ratesCommercialRulesApi: () => "/api/rates/commercial-rules",
	ratePlanPolicies: (id: string) =>
		`/rates/plans/${encodeURIComponent(String(id))}?vista=conditions`,
	ratePlanDetail: (id: string) => `/rates/plans/${encodeURIComponent(String(id))}`,
	ratesCalendar: () => "/rates/calendar",
	ratesMultiCalendar: () => "/rates/multi-calendar",
	pricing: () => "/rates/calendar",
	pricingAutomation: () => "/rates/multi-calendar?tab=price",
	inventory: () => "/rates/calendar?focus=availability",
	inventoryBulk: () => "/rates/calendar?focus=availability&source=inventory-bulk-redirect",
	analyticsPerformance: () => "/analytics/performance",
	analyticsRevenue: () => "/analytics/revenue",
	analyticsOccupancy: () => "/analytics/occupancy",
	integrations: () => "/system/integrations",
	systemIntegrations: () => "/system/integrations",
	productDetail: (productId: string) => `/product/${encodeURIComponent(String(productId))}`,
	productPreview: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/preview`,
}

export type Routes = typeof routes
