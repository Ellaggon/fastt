export const routes = {
	home: () => "/",
	dashboard: () => "/dashboard",
	settings: () => "/provider/settings",
	provider: () => "/provider",
	providerSettings: () => "/provider/settings",
	providerSettingsProfile: () => "/provider/settings/profile",
	providerSettingsVerification: () => "/provider/settings/verification",
	providerSettingsVerificationDocuments: () => "/provider/settings/verification/documents",
	providerSettingsVerificationFiscal: () => "/provider/settings/verification/fiscal",
	providerSettingsVerificationPayments: () => "/provider/settings/verification/payments",
	productCreate: () => "/product/create?playbook=launch&step=create&flow=create",
	providerSettingsTaxFees: () => "/provider/settings/tax-fees",
	providerSettingsTaxIdentity: () => "/provider/settings/tax-fees/identity",
	providerSettingsTaxSales: () => "/provider/settings/tax-fees/sales",
	providerSettingsPayments: () => "/provider/settings/payments",
	providerSettingsIntegrations: () => "/provider/settings/integrations",
	providerSettingsIntegrationsConnections: () => "/provider/settings/integrations/connections",
	providerSettingsIntegrationsCatalog: () => "/provider/settings/integrations/catalog",
	providerSettingsIntegrationsManage: () => "/provider/settings/integrations/manage",
	providerSettingsIntegrationsConnectChannelManager: () =>
		"/provider/settings/integrations/connect/channel-manager",
	providerSettingsIntegrationConnection: (connectionId: string) =>
		`/provider/settings/integrations/connections/${encodeURIComponent(String(connectionId))}`,
	providerSettingsIntegrationMapping: (connectionId: string) =>
		`/provider/settings/integrations/connections/${encodeURIComponent(String(connectionId))}/mapping`,
	providerSettingsIntegrationsIncidents: () => "/provider/settings/integrations/incidents",
	providerSettingsIntegrationsActivity: () => "/provider/settings/integrations/activity",
	providerSettingsIntegrationsCertification: () => "/provider/settings/integrations/certification",
	ratesCalendarConnections: () => "/rates/calendar/connections",
	providerSettingsTeam: () => "/provider/settings/team",
	providerInvitationAccept: () => "/provider/invitations/accept",
	verification: () => "/provider/settings/verification",
	providerHouseRules: () => "/provider/house-rules",
	taxFees: () => "/provider/settings/tax-fees",
	providerTaxFees: () => "/provider/settings/tax-fees",
	providerTaxIdentity: () => "/provider/settings/tax-fees/identity",
	providerTaxSales: () => "/provider/settings/tax-fees/sales",
	providerVerification: () => "/provider/settings/verification",
	accommodations: () => "/dashboard",
	productList: () => "/dashboard",
	productListByType(productType: string) {
		const type = String(productType).trim().toLowerCase()
		if (type === "tour") return "/catalog/tours"
		if (type === "package") return "/catalog/packages"
		if (type === "limousine") return "/catalog/limousines"
		return "/dashboard"
	},
	catalogAccommodations: () => "/dashboard",
	catalogTours: () => "/catalog/tours",
	catalogPackages: () => "/catalog/packages",
	catalogLimousines: () => "/catalog/limousines",
	rooms: () => "/dashboard",
	productRooms: () => "/dashboard",
	productRoomsForProduct: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms`,
	productRoomNew: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/new`,
	productRoomDetail: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}`,
	productRoomProfile: (productId: string, roomId: string) =>
		`/product/${encodeURIComponent(String(productId))}/rooms/${encodeURIComponent(String(roomId))}/profile`,
	productRoomCalendar: (_productId: string, roomId: string) =>
		`/rates/calendar?variantId=${encodeURIComponent(String(roomId))}&focus=availability`,
	productDeparturesForProduct: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/departures`,
	productDepartureNew: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/departures/new`,
	productDepartureDetail: (productId: string, slotId: string) =>
		`/product/${encodeURIComponent(String(productId))}/departures/${encodeURIComponent(String(slotId))}`,
	productTourTickets: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/tickets`,
	bookingList: () => "/booking",
	/** Provider day-of tour departure queue (today's salidas + check-in). */
	bookingDayOf: () => "/booking/day-of",
	tripConfirmation: (bookingId: string) => `/trips/${encodeURIComponent(String(bookingId))}`,
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
	integrations: () => "/provider/settings/integrations",
	systemIntegrations: () => "/provider/settings/integrations",
	productDetail: (productId: string) => `/product/${encodeURIComponent(String(productId))}`,
	productPreview: (productId: string) =>
		`/product/${encodeURIComponent(String(productId))}/preview`,
}

export type Routes = typeof routes
