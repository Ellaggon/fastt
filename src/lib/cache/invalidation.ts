import { delByPrefix } from "./persistentCache"

export async function invalidateProvider(providerId: string): Promise<void> {
	await delByPrefix(`ws:provider:${providerId}`)
	console.debug("cache invalidated", { scope: "provider", id: providerId })
}

export async function invalidateProviderGovernance(
	providerId: string,
	source = "provider_governance_mutation"
): Promise<void> {
	const id = String(providerId ?? "").trim()
	if (!id) return
	await Promise.all([
		delByPrefix(`ws:provider:${id}:governance`),
		delByPrefix(`ws:provider:${id}:settings`),
		delByPrefix(`ws:provider:${id}:surface`),
	])
	console.debug("cache invalidated", { scope: "provider_governance", id, source })
}

export async function invalidateProduct(productId: string): Promise<void> {
	await Promise.all([delByPrefix(`ws:product:${productId}`), delByPrefix("ws:search:public")])
	console.debug("cache invalidated", { scope: "product", id: productId })
}

export async function invalidateVariant(variantId: string, productId: string): Promise<void> {
	await Promise.all([
		delByPrefix(`ws:variant:${variantId}`),
		delByPrefix(`ws:availability:${variantId}`),
		delByPrefix(`ws:product:${productId}:variants`),
		delByPrefix(`ws:product:${productId}`),
		delByPrefix("ws:pricing:rateplans:"),
		delByPrefix("ws:search:public"),
	])
	console.debug("cache invalidated", { scope: "variant", id: variantId, productId })
}

export async function invalidateInventoryAvailabilitySurface(params: {
	variantId: string
	productId?: string | null
}): Promise<void> {
	const variantId = String(params.variantId ?? "").trim()
	if (!variantId) return
	const tasks: Array<Promise<unknown>> = [
		delByPrefix(`ws:availability:${variantId}`),
		delByPrefix("ws:search:public"),
	]
	if (params.productId) tasks.push(delByPrefix(`ws:product:${params.productId}`))
	await Promise.all(tasks)
	console.debug("cache invalidated", {
		scope: "inventory_availability",
		variantId,
		productId: params.productId ?? null,
	})
}

export async function invalidatePricing(params: {
	ratePlanId?: string | null
	variantId?: string | null
	productId?: string | null
	providerId?: string | null
}): Promise<void> {
	const tasks: Array<Promise<unknown>> = [
		delByPrefix("ws:pricing:rateplans:"),
		delByPrefix("ws:search:public"),
	]
	if (params.ratePlanId) tasks.push(delByPrefix(`ws:pricing:rateplan:${params.ratePlanId}:`))
	if (params.variantId) tasks.push(delByPrefix(`ws:variant:${params.variantId}`))
	if (params.productId) tasks.push(delByPrefix(`ws:product:${params.productId}`))
	if (params.providerId) tasks.push(delByPrefix(`ws:provider:${params.providerId}`))
	await Promise.all(tasks)
	console.debug("cache invalidated", { scope: "pricing", ...params })
}

export async function invalidatePolicyConditions(params: {
	scope: string
	scopeId: string
	productId?: string | null
}): Promise<void> {
	await delByPrefix("ws:pricing:rateplans:")
	await delByPrefix("ws:search:public")
	if (params.productId) await delByPrefix(`ws:product:${params.productId}`)
	console.debug("cache invalidated", {
		scope: "policy_conditions",
		policyScope: params.scope,
		scopeId: params.scopeId,
		productId: params.productId ?? null,
	})
}

export async function invalidateAllPolicyConditions(source = "invalidate_all_policy_conditions") {
	await delByPrefix("ws:pricing:")
	await delByPrefix("ws:search:public")
	console.debug("cache invalidated", { scope: "policy_conditions", source, global: true })
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

export async function invalidateFinancialProviderSummary(params: {
	providerId?: string | null
	reason: string
	refresh?: boolean
}): Promise<void> {
	const providerId = String(params.providerId ?? "").trim()
	if (!providerId) return
	await delByPrefix(`ws:financial:provider:${providerId}:`)
	console.debug("cache invalidated", {
		scope: "financial_provider_summary",
		providerId,
		reason: params.reason,
	})
}
