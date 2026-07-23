import { delByPrefix } from "./persistentCache"

function refreshProductSurface(productId: string, source: string): void {
	void import("@/lib/product/productOperationalSurface")
		.then(({ refreshProductOperationalSurfaceByProductId }) =>
			refreshProductOperationalSurfaceByProductId({ productId, source })
		)
		.catch(() => {})
}

function refreshProviderConfiguration(providerId: string, source: string): void {
	const id = String(providerId ?? "").trim()
	if (!id) return
	void import("@/lib/provider-governance")
		.then(({ refreshProviderConfigurationState }) =>
			refreshProviderConfigurationState({ providerId: id })
		)
		.catch(() => {})
	console.debug("provider configuration refresh queued", { source, providerId: id })
}

function refreshRatePlanConditions(ratePlanIds: string[], source: string): void {
	const ids = [...new Set(ratePlanIds.map((id) => String(id ?? "").trim()).filter(Boolean))]
	if (!ids.length) return
	void import("@/lib/policies/ratePlanConditionState")
		.then(({ refreshRatePlanConditionStates }) =>
			refreshRatePlanConditionStates({ ratePlanIds: ids, channel: "web" })
		)
		.catch(() => {})
	console.debug("rate plan conditions refresh queued", { source, ratePlanIds: ids })
}

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
	refreshProviderConfiguration(id, source)
	console.debug("cache invalidated", { scope: "provider_governance", id, source })
}

export async function invalidateProduct(productId: string): Promise<void> {
	await Promise.all([delByPrefix(`ws:product:${productId}`), delByPrefix("ws:search:public")])
	refreshProductSurface(productId, "invalidate_product")
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
	refreshProductSurface(productId, "invalidate_variant")
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
	if (params.productId) refreshProductSurface(params.productId, "invalidate_inventory_availability")
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
	if (params.productId) refreshProductSurface(params.productId, "invalidate_pricing")
	if (params.ratePlanId) refreshRatePlanConditions([params.ratePlanId], "invalidate_pricing")
	console.debug("cache invalidated", { scope: "pricing", ...params })
}

export async function invalidatePolicyConditions(params: {
	scope: string
	scopeId: string
	productId?: string | null
}): Promise<void> {
	const { resolveRatePlanIdsForConditionScope } =
		await import("@/lib/policies/ratePlanConditionState")
	const ratePlanIds = await resolveRatePlanIdsForConditionScope({
		scope: params.scope,
		scopeId: params.scopeId,
	})
	await delByPrefix("ws:pricing:rateplans:")
	await delByPrefix("ws:search:public")
	await Promise.all(
		ratePlanIds.map((ratePlanId) => delByPrefix(`ws:pricing:rateplan:${ratePlanId}:`))
	)
	refreshRatePlanConditions(ratePlanIds, "invalidate_policy_conditions")
	if (params.productId) refreshProductSurface(params.productId, "invalidate_policy_conditions")
	console.debug("cache invalidated", {
		scope: "policy_conditions",
		policyScope: params.scope,
		scopeId: params.scopeId,
		ratePlanIds,
		productId: params.productId ?? null,
	})
}

export async function invalidateAllPolicyConditions(source = "invalidate_all_policy_conditions") {
	await delByPrefix("ws:pricing:")
	await delByPrefix("ws:search:public")
	void import("@/lib/policies/ratePlanConditionState")
		.then(({ refreshRatePlanConditionStates }) =>
			refreshRatePlanConditionStates({ channel: "web" })
		)
		.catch(() => {})
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
	void import("@/lib/financial/financialProviderSummary")
		.then(({ invalidateFinancialProviderSummary: invalidateSummary }) =>
			invalidateSummary({
				providerId,
				reason: params.reason,
				refresh: params.refresh ?? true,
			})
		)
		.catch(() => {})
	console.debug("cache invalidated", {
		scope: "financial_provider_summary",
		providerId,
		reason: params.reason,
	})
}
