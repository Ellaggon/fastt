export const PRICING_BULK_MAX_RATE_PLANS = 200
export const PRICING_BULK_ASYNC_PREVIEW_THRESHOLD = 20
export const PRICING_BULK_DEFAULT_MAX_ATTEMPTS = 3
export const PRICING_BULK_DEFAULT_FINALIZATION_MAX_ATTEMPTS = 5

export function shouldQueuePricingPreview(ratePlanCount: number): boolean {
	return ratePlanCount > PRICING_BULK_ASYNC_PREVIEW_THRESHOLD
}
