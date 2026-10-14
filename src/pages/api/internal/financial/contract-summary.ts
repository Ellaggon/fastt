import type { APIRoute } from "astro"
import { requireFinancialProvider } from "./_stage2"
import { resolveFinancialApiProductScope } from "@/lib/financial/financialApiProductScope"
import { loadProviderContractSurface } from "@/lib/commercial-policy/provider-contract-surface"
import { safeFinancialReturn } from "@/lib/financial/financialReturn"

export const GET: APIRoute = async ({ request, url }) => {
	const auth = await requireFinancialProvider(request)
	if (!auth.ok) return auth.response
	const scope = await resolveFinancialApiProductScope(auth.providerId, url)
	if (!scope.ok) return scope.response
	const returnTo =
		safeFinancialReturn(url.searchParams.get("returnTo")) ??
		`/financial${url.searchParams.has("scope") ? `?scope=${encodeURIComponent(url.searchParams.get("scope")!)}` : ""}`
	try {
		const model = await loadProviderContractSurface(auth.providerId, {
			productIds: scope.productFilter,
			returnTo,
		})
		return Response.json(model, { headers: { "Cache-Control": "private, no-store" } })
	} catch (error) {
		console.error("financial_contract_summary", error)
		return Response.json(
			{ error: "contract_read_failed" },
			{ status: 503, headers: { "Cache-Control": "private, no-store" } }
		)
	}
}
