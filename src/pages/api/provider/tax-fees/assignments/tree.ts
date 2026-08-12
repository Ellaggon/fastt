import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { resolveEffectiveTaxFeesUseCase } from "@/container/taxes-fees.container"
import {
	db,
	and,
	eq,
	inArray,
	Product,
	RatePlan,
	TaxFeeAssignment,
	TaxFeeDefinition,
	Variant,
} from "@/shared/infrastructure/db/compat"

const labels: Record<string, string> = {
	hotel: "Hotel",
	hotels: "Hotel",
	tour: "Tour",
	tours: "Tour",
}

export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) return Response.json({ error: "unauthorized" }, { status: 401 })

	const url = new URL(request.url)
	const channel = url.searchParams.get("channel") || null
	const selectedScopeId = String(url.searchParams.get("scope") ?? "").trim() || null
	const cacheKey = `fiscal:assignment-tree:${providerId}:${selectedScopeId ?? "all"}:${channel ?? "all"}`
	const { getAggregateCache, setAggregateCache } = await import("@/lib/cache/ssrAggregateCache")
	const cached = getAggregateCache<Record<string, unknown>>(cacheKey)
	if (cached) return Response.json(cached)
	const products = await db
		.select({ id: Product.id, name: Product.name, productType: Product.productType })
		.from(Product)
		.where(
			selectedScopeId
				? and(eq(Product.providerId, providerId), eq(Product.id, selectedScopeId))
				: eq(Product.providerId, providerId)
		)
	const productIds = products.map((product) => product.id)
	const variants = productIds.length
		? await db
				.select({
					id: Variant.id,
					productId: Variant.productId,
					name: Variant.name,
					kind: Variant.kind,
				})
				.from(Variant)
				.where(inArray(Variant.productId, productIds))
		: []
	const variantIds = variants.map((variant) => variant.id)
	const ratePlans = variantIds.length
		? await db
				.select({
					id: RatePlan.id,
					variantId: RatePlan.variantId,
					name: RatePlan.name,
					isActive: RatePlan.isActive,
				})
				.from(RatePlan)
				.where(inArray(RatePlan.variantId, variantIds))
		: []
	const definitionRows = await db
		.select({
			id: TaxFeeDefinition.id,
			name: TaxFeeDefinition.name,
			code: TaxFeeDefinition.code,
			status: TaxFeeDefinition.status,
			editingState: TaxFeeDefinition.editingState,
			jurisdictionJson: TaxFeeDefinition.jurisdictionJson,
		})
		.from(TaxFeeDefinition)
		.where(eq(TaxFeeDefinition.providerId, providerId))
	const definitions = new Map(definitionRows.map((definition) => [definition.id, definition]))
	const assignableDefinitions = definitionRows.filter((definition) => {
		const country = String(
			(definition.jurisdictionJson as { country?: string } | null)?.country ?? ""
		)
		return (
			definition.status === "active" &&
			definition.editingState !== "draft" &&
			/^[A-Za-z]{2}$/.test(country)
		)
	})
	const assignments = definitionRows.length
		? await db
				.select()
				.from(TaxFeeAssignment)
				.where(
					inArray(
						TaxFeeAssignment.taxFeeDefinitionId,
						definitionRows.map((definition) => definition.id)
					)
				)
		: []

	const activeAssignments = assignments.filter((assignment) => assignment.status === "active")
	const directByScope = new Map<string, typeof activeAssignments>()
	for (const assignment of activeAssignments) {
		const key = `${assignment.scope}:${assignment.scopeId ?? providerId}:${assignment.channel ?? "all"}`
		directByScope.set(key, [...(directByScope.get(key) ?? []), assignment])
	}
	const duplicateKeys = new Set<string>()
	for (const [key, entries] of directByScope) {
		if (new Set(entries.map((entry) => entry.taxFeeDefinitionId)).size !== entries.length)
			duplicateKeys.add(key)
	}
	const assignmentView = (scope: string, scopeId: string) =>
		(
			directByScope.get(`${scope}:${scopeId}:${channel ?? "all"}`) ??
			directByScope.get(`${scope}:${scopeId}:all`) ??
			[]
		).map((assignment) => ({
			id: assignment.id,
			definitionId: assignment.taxFeeDefinitionId,
			name: definitions.get(assignment.taxFeeDefinitionId)?.name ?? "Regla eliminada",
			effectiveFrom: assignment.effectiveFrom,
			effectiveTo: assignment.effectiveTo,
		}))

	const variantRows = await Promise.all(
		variants.map(async (variant) => {
			const variantRates = ratePlans.filter((ratePlan) => ratePlan.variantId === variant.id)
			const rates = await Promise.all(
				variantRates.map(async (ratePlan) => {
					const effective = await resolveEffectiveTaxFeesUseCase({
						providerId,
						productId: variant.productId,
						variantId: variant.id,
						ratePlanId: ratePlan.id,
						channel,
					})
					const key = `rate_plan:${ratePlan.id}:${channel ?? "all"}`
					const direct =
						directByScope.get(key) ?? directByScope.get(`rate_plan:${ratePlan.id}:all`) ?? []
					const effectiveRules = effective.definitions.map((resolved) => ({
						id: resolved.definition.id,
						name: resolved.definition.name,
						code: resolved.definition.code,
						source: resolved.source.scope,
						inherited: resolved.source.scope !== "rate_plan",
					}))
					const codes = effectiveRules.map((rule) => rule.code)
					return {
						id: ratePlan.id,
						name: ratePlan.name,
						isActive: Boolean(ratePlan.isActive),
						directAssignments: direct.map((assignment) => ({
							id: assignment.id,
							definitionId: assignment.taxFeeDefinitionId,
							name: definitions.get(assignment.taxFeeDefinitionId)?.name ?? "Regla eliminada",
							effectiveFrom: assignment.effectiveFrom,
							effectiveTo: assignment.effectiveTo,
						})),
						effectiveRules,
						conflict: duplicateKeys.has(key) || new Set(codes).size !== codes.length,
						syncStatus: channel ? "pending" : "ready",
					}
				})
			)
			return {
				id: variant.id,
				name: variant.name,
				kind: variant.kind,
				directAssignments: assignmentView("variant", variant.id),
				rates,
			}
		})
	)

	const responseBody = {
		provider: {
			id: providerId,
			name: "Proveedor",
			directAssignments: assignmentView("provider", providerId),
		},
		products: products.map((product) => ({
			id: product.id,
			name: product.name,
			productType: product.productType,
			productTypeLabel: labels[String(product.productType).toLowerCase()] ?? "Producto",
			directAssignments: assignmentView("product", product.id),
			variants: variantRows.filter(
				(variant) =>
					variant.rates.some((rate) => rate) &&
					variants.find((entry) => entry.id === variant.id)?.productId === product.id
			),
		})),
		definitions: assignableDefinitions,
	}
	setAggregateCache(cacheKey, responseBody, {
		ttlMs: 5_000,
		tags: [
			`provider:${providerId}`,
			...products.map((product) => `product:${product.id}`),
			...variants.map((variant) => `variant:${variant.id}`),
		],
	})
	return Response.json(responseBody)
}
