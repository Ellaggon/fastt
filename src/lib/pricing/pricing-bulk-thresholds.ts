export const PRICING_BULK_ASYNC_PREVIEW_THRESHOLD = 20

export function shouldQueuePricingPreview(ratePlanCount: number): boolean {
	return ratePlanCount > PRICING_BULK_ASYNC_PREVIEW_THRESHOLD
}
