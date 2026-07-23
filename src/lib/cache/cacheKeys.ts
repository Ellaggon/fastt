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
	providerSidebar(providerId: string, userId: string, professionalToolsEnabled: string): string {
		return `ws:provider:${providerId}:sidebar:${userId}:${professionalToolsEnabled}`
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
	providerBookingsSummary: 30,
	productSurface: 60,
	productVariantsList: 30,
	providerSettingsSummary: 20,
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
