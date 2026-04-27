export const cacheKeys = {
	providerSurface(providerId: string): string {
		return `ws:provider:${providerId}:surface`
	},
	providerBookingsSummary(providerId: string, status: string, from: string, to: string): string {
		return `ws:provider:${providerId}:bookings:summary:${status}:${from}:${to}`
	},
	productSurface(productId: string): string {
		return `ws:product:${productId}:surface`
	},
	productVariantsList(productId: string): string {
		return `ws:product:${productId}:variants:list`
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
	holdPricingSnapshot(holdId: string): string {
		return `ws:hold:${holdId}:pricing`
	},
	holdPolicySnapshot(holdId: string): string {
		return `ws:hold:${holdId}:policy`
	},
	authProviderBySession(sessionId: string): string {
		return `ws:auth:user:${sessionId}:providerId`
	},
}

export const cacheTtls = {
	providerSurface: 60,
	providerBookingsSummary: 30,
	productSurface: 60,
	productVariantsList: 30,
	variantDetail: 30,
	availabilitySummary: 20,
	authProviderBySession: 60,
} as const
