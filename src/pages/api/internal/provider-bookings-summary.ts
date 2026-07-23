import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
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

		const status = String(url.searchParams.get("status") ?? "all")
			.trim()
			.toLowerCase()
		const from = String(url.searchParams.get("from") ?? "").trim()
		const to = String(url.searchParams.get("to") ?? "").trim()
		const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 100))
		const result = await readThrough(
			cacheKeys.providerBookingsSummary(providerId, status, from || "any", to || "any", limit),
			cacheTtls.providerBookingsSummary,
			() =>
				bookingOperationsQueryRepository.listByProvider({
					providerId,
					status,
					from: from || undefined,
					to: to || undefined,
					limit,
				})
		)
		logEndpoint()
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		return new Response(JSON.stringify(result), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Server-Timing": `provider-bookings-summary;dur=${durationMs}`,
			},
		})
	} catch (error) {
		logEndpoint()
		return new Response(
			JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		)
	}
}
