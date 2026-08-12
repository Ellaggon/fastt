import { delByPrefix } from "./persistentCache"
import { cacheKeys } from "./cacheKeys"
import { invalidateAggregateCache } from "./ssrAggregateCache"

async function invalidateRatePlanSurfacesByOwnership(params: {
	providerId?: string | null
	productId?: string | null
	variantId?: string | null
	ratePlanIds?: string[]
}): Promise<void> {
	const providerIds = new Set<string>()
	if (params.providerId) providerIds.add(String(params.providerId).trim())
	if (params.productId || params.variantId || params.ratePlanIds?.length) {
		const { and, db, eq, inArray, Product, RatePlan, Variant } =
			await import("@/shared/infrastructure/db/compat")
		const filters = []
		if (params.productId) filters.push(eq(Product.id, params.productId))
		if (params.variantId) filters.push(eq(Variant.id, params.variantId))
		const ratePlanIds = (params.ratePlanIds ?? []).filter(Boolean)
		if (ratePlanIds.length) filters.push(inArray(RatePlan.id, ratePlanIds))
		if (filters.length) {
			const rows = await db
				.select({ providerId: Product.providerId })
				.from(Product)
				.innerJoin(Variant, eq(Variant.productId, Product.id))
				.leftJoin(RatePlan, eq(RatePlan.variantId, Variant.id))
				.where(and(...filters))
			for (const row of rows) providerIds.add(String(row.providerId ?? "").trim())
		}
	}
	await Promise.all(
		[...providerIds]
			.filter(Boolean)
			.flatMap((providerId) => [
				delByPrefix(cacheKeys.providerRatePlansSurfacePrefix(providerId)),
				delByPrefix(cacheKeys.providerRatePlanVariants(providerId)),
				delByPrefix(cacheKeys.calendarSurfacePrefix(providerId)),
			])
	)
}

function refreshProductSurface(productId: string, source: string): void {
	void import("@/lib/product/productOperationalSurface")
		.then(({ refreshProductOperationalSurfaceByProductId }) =>
			refreshProductOperationalSurfaceByProductId({ productId, source })
		)
		.catch(() => {})
}

const pendingProviderConfigurationRefreshes = new Set<Promise<void>>()

function refreshProviderConfiguration(providerId: string, source: string): void {
	const id = String(providerId ?? "").trim()
	if (!id) return
	// Fire-and-forget: never surface statement timeouts as unhandled rejections.
	const refresh = (async () => {
		try {
			const { refreshProviderConfigurationState } = await import("@/lib/provider-governance")
			await refreshProviderConfigurationState({ providerId: id })
		} catch (error) {
			console.error("provider configuration refresh failed", {
				source,
				providerId: id,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	})().finally(() => pendingProviderConfigurationRefreshes.delete(refresh))
	pendingProviderConfigurationRefreshes.add(refresh)
	console.debug("provider configuration refresh queued", { source, providerId: id })
}

/** Allows short-lived maintenance scripts to drain refreshes before closing the DB pool. */
export async function waitForProviderConfigurationRefreshes(): Promise<void> {
	await Promise.allSettled([...pendingProviderConfigurationRefreshes])
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
	invalidateAggregateCache({ providerId })
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
		delByPrefix(`ws:provider:${id}:integrations`),
		delByPrefix(`ws:provider:${id}:surface`),
	])
	refreshProviderConfiguration(id, source)
	console.debug("cache invalidated", { scope: "provider_governance", id, source })
}

export async function invalidateProviderIntegrations(
	providerId: string,
	source = "provider_integrations_mutation"
): Promise<void> {
	const id = String(providerId ?? "").trim()
	if (!id) return
	await Promise.all([
		delByPrefix(`ws:provider:${id}:integrations`),
		delByPrefix(cacheKeys.calendarSurfacePrefix(id)),
	])
	console.debug("cache invalidated", { scope: "provider_integrations", id, source })
}

export async function invalidateCalendarSurface(providerId: string, source: string): Promise<void> {
	const id = String(providerId ?? "").trim()
	if (!id) return
	await delByPrefix(cacheKeys.calendarSurfacePrefix(id))
	console.debug("cache invalidated", { scope: "calendar_surface", providerId: id, source })
}

export async function invalidateProduct(productId: string): Promise<void> {
	await Promise.all([
		delByPrefix(`ws:product:${productId}`),
		delByPrefix("ws:search:public"),
		invalidateRatePlanSurfacesByOwnership({ productId }),
	])
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
		invalidateRatePlanSurfacesByOwnership({ variantId, productId }),
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
	await invalidateRatePlanSurfacesByOwnership({
		variantId,
		productId: params.productId,
	})
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
	await invalidateRatePlanSurfacesByOwnership({
		providerId: params.providerId,
		productId: params.productId,
		variantId: params.variantId,
		ratePlanIds: params.ratePlanId ? [params.ratePlanId] : [],
	})
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
	await invalidateRatePlanSurfacesByOwnership({
		productId: params.productId,
		ratePlanIds,
	})
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
