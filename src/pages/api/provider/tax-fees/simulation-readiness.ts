import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getFiscalSimulationReadiness } from "@/lib/taxes-fees/fiscal-simulation-readiness"
import { getFiscalWorkspaceResources } from "@/lib/taxes-fees/fiscal-workspace-resources"

/**
 * Keeps Definitions and Simulator honest about what this specific rule still
 * needs before a real, prefilled PriceQuote can certify it.
 */
export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) return Response.json({ error: "unauthorized" }, { status: 401 })

	const url = new URL(request.url)
	const definitionId = url.searchParams.get("definitionId")?.trim()
	if (!definitionId) return Response.json({ error: "validation_error" }, { status: 400 })

	const resources = await getFiscalWorkspaceResources(providerId)
	const scopeId = url.searchParams.get("scope")?.trim() || null
	const workspaceProductId = resources.products.some((product) => product.id === scopeId)
		? scopeId
		: null
	const readiness = await getFiscalSimulationReadiness({
		providerId,
		definitionId,
		resources,
		workspaceProductId,
		manualMode: url.searchParams.get("mode") === "manual",
	})
	if (!readiness) return Response.json({ error: "not_found" }, { status: 404 })

	return Response.json(readiness)
}
