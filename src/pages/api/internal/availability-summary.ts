import type { APIRoute } from "astro"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getInventoryAvailabilitySurface } from "@/lib/inventory/inventoryAvailabilitySurface"

export const GET: APIRoute = async ({ request, url }) => {
	const startedAt = performance.now()
	const endpointName = "availability-summary"
	const logEndpoint = () => {
		const durationMs = Number((performance.now() - startedAt).toFixed(1))
		console.debug("endpoint", { name: endpointName, durationMs })
		if (durationMs > 1000) {
			console.warn("slow endpoint", { name: endpointName, durationMs })
		}
	}

	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const variantId = String(url.searchParams.get("variantId") ?? "").trim()
		const from = String(url.searchParams.get("from") ?? "").trim()
		const to = String(url.searchParams.get("to") ?? "").trim()
		const occupancy = Number(url.searchParams.get("occupancy") ?? 1)

		if (!variantId || !from || !to || !Number.isFinite(occupancy) || occupancy <= 0 || to <= from) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const result = await getInventoryAvailabilitySurface({
			variantId,
			from,
			to,
			occupancy,
		})
		if (!result.surface) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: {
					"Content-Type": "application/json",
					"X-Fastt-Cache": result.cacheState,
				},
			})
		}

		logEndpoint()
		return new Response(JSON.stringify(result.surface), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"X-Fastt-Cache": result.cacheState,
			},
		})
	} catch (error) {
		logEndpoint()
		const message = error instanceof Error ? error.message : "internal_error"
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}
}
