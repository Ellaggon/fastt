import type { APIRoute } from "astro"

import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { bookingOperationsQueryRepository } from "@/modules/booking/public"

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: "booking-summary", durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: "booking-summary", durationMs })
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

		const bookingId = String(url.searchParams.get("bookingId") ?? "").trim()
		if (!bookingId) {
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await bookingOperationsQueryRepository.getById({ providerId, bookingId })
		if (!result) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

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
