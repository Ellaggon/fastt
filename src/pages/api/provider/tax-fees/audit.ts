import type { APIRoute } from "astro"

import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"
import { getProviderFiscalityAudit } from "@/lib/taxes-fees/fiscality-audit"

export const GET: APIRoute = async ({ request }) => {
	try {
		const { provider } = await requireProviderSessionSurface(request)
		const audit = await getProviderFiscalityAudit(provider.providerId)
		return new Response(JSON.stringify({ audit }), {
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		if (error instanceof Response) return error
		return new Response(JSON.stringify({ error: "fiscality_audit_unavailable" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
