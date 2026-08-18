export const cacheKeys = {
	providerSurface(providerId: string): string {
		return `ws:provider:${providerId}:surface`
	},
	providerBookingsSummary(
		providerId: string,
		status: string,
		from: string,
		to: string,
		limit = 25
	): string {
		return `ws:provider:${providerId}:bookings:summary:${status}:${from}:${to}:${limit}`
	},
	providerSidebar(
		providerId: string,
		userId: string,
		workspaceExperience: "essential" | "professional",
		providerRole: string
	): string {
		const mode = workspaceExperience === "professional" ? "professional" : "essential"
		return `ws:provider:${providerId}:sidebar:v2:${userId}:${mode}:${providerRole}`
	},
	providerRatePlansSurface(providerId: string, checkIn: string, checkOut: string): string {
		return `ws:provider:${providerId}:rates:surface:${checkIn}:${checkOut}`
	},
	providerRatePlansSurfacePrefix(providerId: string): string {
		return `ws:provider:${providerId}:rates:surface:`
	},
	providerRatePlanVariants(providerId: string): string {
		return `ws:provider:${providerId}:rates:variants`
	},
	calendarSurface(
		providerId: string,
		ratePlanId: string,
		variantId: string,
		month: string
	): string {
		return `ws:provider:${providerId}:calendar:${variantId}:${ratePlanId}:${month}`
	},
	calendarSurfacePrefix(providerId: string): string {
		return `ws:provider:${providerId}:calendar:`
	},
	productSurface(productId: string): string {
		return `ws:product:${productId}:surface`
	},
	productVariantsList(productId: string): string {
		return `ws:product:${productId}:variants:list`
	},
	providerSettingsSummary(providerId: string, userId: string): string {
		return `ws:provider:${providerId}:settings:summary:${userId}`
	},
	providerIntegrationsSummary(providerId: string): string {
		return `ws:provider:${providerId}:integrations:summary`
	},
	providerIntegrationsConnections(providerId: string): string {
		return `ws:provider:${providerId}:integrations:connections`
	},
	providerIntegrationsCatalog(providerId: string): string {
		return `ws:provider:${providerId}:integrations:catalog`
	},
	providerIntegrationsIncidents(
		providerId: string,
		status: string,
		connectionId: string,
		limit: number
	): string {
		return `ws:provider:${providerId}:integrations:incidents:${status}:${connectionId || "all"}:${limit}`
	},
	providerIntegrationsIncidentCounts(providerId: string, connectionId: string): string {
		return `ws:provider:${providerId}:integrations:incidents:counts:${connectionId || "all"}`
	},
	providerGovernanceSummary(providerId: string, userId: string): string {
		return `ws:provider:${providerId}:governance:summary:${userId}`
	},
	ratePlanPricingSummary(ratePlanId: string): string {
		return `ws:pricing:rateplan:${ratePlanId}:summary`
	},
	ratePlanPricingSummaries(ratePlanIds: string[]): string {
		const normalizedIds = [...new Set(ratePlanIds.map((id) => String(id).trim()).filter(Boolean))]
			.sort()
			.join(",")
		return `ws:pricing:rateplans:${normalizedIds}:summaries`
	},
	ratePlanPricingPrefix(ratePlanId: string): string {
		return `ws:pricing:rateplan:${ratePlanId}:`
	},
	variantDetail(variantId: string): string {
		return `ws:variant:${variantId}:detail`
	},
	availability(
		variantId: string,
		from: string,
		to: string,
		occupancy: number,
		currency: string
	): string {
		return `ws:availability:${variantId}:${from}:${to}:${occupancy}:${currency}`
	},
	inventoryAvailabilitySurface(
		variantId: string,
		from: string,
		to: string,
		occupancyKey: string
	): string {
		return `ws:availability:${variantId}:surface:${from}:${to}:${occupancyKey}`
	},
	publicSearchQuery(params: {
		destinationId: string
		checkIn: string
		checkOut: string
		rooms: number
		adults: number
		children: number
		currency: string
	}): string {
		return [
			"ws:search:public",
			params.destinationId,
			params.checkIn,
			params.checkOut,
			params.rooms,
			params.adults,
			params.children,
			params.currency,
		].join(":")
	},
	searchFreshnessMonitor(scope = "global"): string {
		return `ws:search:freshness:${scope}`
	},
	financialProviderSummary(providerId: string): string {
		return `ws:financial:provider:${providerId}:summary`
	},
	financialProviderSummaryPrefix(providerId: string): string {
		return `ws:financial:provider:${providerId}:`
	},
	holdPricingSnapshot(holdId: string): string {
		return `ws:hold:${holdId}:pricing`
	},
	holdPolicySnapshot(holdId: string): string {
		return `ws:hold:${holdId}:policy`
	},
	authProviderBySession(sessionId: string): string {
		return `ws:auth:user:${sessionId}:providerId`
	},
	authUserBySession(sessionId: string): string {
		return `ws:auth:session:${sessionId}:user`
	},
	authProviderByUserSession(userId: string, sessionId: string): string {
		return `ws:auth:user:${userId}:session:${sessionId}:providerId`
	},
	providerSessionSurface(userId: string, sessionId: string): string {
		return `ws:auth:user:${userId}:session:${sessionId}:provider:surface`
	},
	authUserPrefix(userId: string): string {
		return `ws:auth:user:${userId}:`
	},
}

export const cacheTtls = {
	providerSurface: 60,
	providerSidebar: 20,
	providerRatePlansSurface: 20,
	providerRatePlanVariants: 30,
	calendarSurface: 15,
	providerBookingsSummary: 30,
	productSurface: 60,
	productVariantsList: 30,
	providerSettingsSummary: 20,
	providerIntegrationsSummary: 30,
	providerIntegrationsConnections: 20,
	providerIntegrationsCatalog: 30,
	providerIntegrationsIncidents: 15,
	providerGovernanceSummary: 20,
	pricingSummary: 30,
	variantDetail: 30,
	availabilitySummary: 20,
	inventoryAvailabilitySurface: 10,
	publicSearchQuery: 15,
	searchFreshnessMonitor: 20,
	financialProviderSummary: 30,
	authUserBySession: 45,
	authProviderBySession: 45,
	providerSessionSurface: 45,
} as const
