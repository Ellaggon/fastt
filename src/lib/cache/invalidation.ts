import { delByPrefix } from "./persistentCache"

export async function invalidateProvider(providerId: string): Promise<void> {
	await delByPrefix(`ws:provider:${providerId}`)
	console.debug("cache invalidated", { scope: "provider", id: providerId })
}

export async function invalidateProduct(productId: string): Promise<void> {
	await delByPrefix(`ws:product:${productId}`)
	console.debug("cache invalidated", { scope: "product", id: productId })
}

export async function invalidateVariant(variantId: string, productId: string): Promise<void> {
	await Promise.all([
		delByPrefix(`ws:variant:${variantId}`),
		delByPrefix(`ws:availability:${variantId}`),
		delByPrefix(`ws:product:${productId}:variants`),
		delByPrefix(`ws:product:${productId}`),
	])
	console.debug("cache invalidated", { scope: "variant", id: variantId, productId })
}

export async function invalidateBooking(
	bookingId: string,
	providerId?: string | null
): Promise<void> {
	const tasks: Array<Promise<unknown>> = [delByPrefix(`ws:booking:${bookingId}`)]
	if (providerId) {
		tasks.push(delByPrefix(`ws:provider:${providerId}:bookings:summary`))
	}
	await Promise.all(tasks)
	console.debug("cache invalidated", {
		scope: "booking",
		id: bookingId,
		providerId: providerId ?? null,
	})
}
