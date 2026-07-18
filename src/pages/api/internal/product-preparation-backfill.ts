import type { APIRoute } from "astro"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { backfillProductPreparationSnapshots } from "@/lib/playbook/backfill-product-preparation-snapshots"

export const POST: APIRoute = async ({ request }) => {
	const user = await getUserFromRequest(request)
	if (!user?.email) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		})
	}

	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const body = (await request.json().catch(() => ({}))) as {
		productId?: unknown
		limit?: unknown
	}
	const requestedProductId = String(body.productId ?? "").trim()
	const requestedLimit = Number(body.limit)
	const result = await backfillProductPreparationSnapshots({
		providerId,
		productId: requestedProductId || null,
		limit: Number.isFinite(requestedLimit) ? requestedLimit : null,
	})

	return new Response(JSON.stringify(result), {
		status: result.ok ? 200 : 207,
		headers: {
			"Content-Type": "application/json",
			"Server-Timing": `product-preparation-backfill;dur=${result.durationMs}`,
		},
	})
}
