import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import {
	getFiscalWorkspaceResources,
	getRecommendedFiscalSimulationContext,
} from "@/lib/taxes-fees/fiscal-workspace-resources"
import { and, db, eq, TaxFeeDefinition } from "@/shared/infrastructure/db/compat"

/**
 * Keeps the Definitions detail panel honest about whether it can open a real,
 * prefilled PriceQuote without making the definitions catalogue do this work.
 */
export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) return Response.json({ error: "unauthorized" }, { status: 401 })

	const url = new URL(request.url)
	const definitionId = url.searchParams.get("definitionId")?.trim()
	if (!definitionId) return Response.json({ error: "validation_error" }, { status: 400 })

	const definition = await db
		.select({ id: TaxFeeDefinition.id })
		.from(TaxFeeDefinition)
		.where(and(eq(TaxFeeDefinition.id, definitionId), eq(TaxFeeDefinition.providerId, providerId)))
		.then((rows) => rows[0] ?? null)
	if (!definition) return Response.json({ error: "not_found" }, { status: 404 })

	const resources = await getFiscalWorkspaceResources(providerId)
	const scopeId = url.searchParams.get("scope")?.trim() || null
	const preferredProductId = resources.products.some((product) => product.id === scopeId)
		? scopeId
		: null
	const recommendation = await getRecommendedFiscalSimulationContext({
		resources,
		preferredProductId,
	})

	return Response.json(recommendation)
}
