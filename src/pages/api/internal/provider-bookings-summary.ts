import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { bookingOperationsQueryRepository } from "@/modules/booking/public"

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: "provider-bookings-summary", durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: "provider-bookings-summary", durationMs })
		}
	}

	try {
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

		const result = await bookingOperationsQueryRepository.listByProvider({
			providerId,
			status: String(url.searchParams.get("status") ?? "all")
				.trim()
				.toLowerCase(),
			from: String(url.searchParams.get("from") ?? "").trim() || undefined,
			to: String(url.searchParams.get("to") ?? "").trim() || undefined,
		})
		logEndpoint()
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		logEndpoint()
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
