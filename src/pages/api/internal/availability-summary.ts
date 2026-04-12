import type { APIRoute } from "astro"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { getAvailabilityAggregate } from "@/modules/catalog/public"
import { releaseExpiredHolds } from "@/modules/inventory/public"
import { inventoryHoldRepository, variantManagementRepository } from "@/container"

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
		const currency = String(url.searchParams.get("currency") ?? "USD")
			.trim()
			.toUpperCase()

		if (!variantId || !from || !to || !Number.isFinite(occupancy) || occupancy <= 0) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "validation_error" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		const variant = await variantManagementRepository.getVariantById(variantId)
		if (!variant) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const expired = await releaseExpiredHolds(
			{ repo: inventoryHoldRepository },
			{ now: new Date() }
		)
		if (expired.releasedVariantIds.length > 0) {
			await Promise.all(
				expired.releasedVariantIds.map(async (expiredVariantId) => {
					const v = await variantManagementRepository.getVariantById(expiredVariantId)
					if (v) {
						await invalidateVariant(expiredVariantId, v.productId)
					}
				})
			)
		}

		const aggregate = await getAvailabilityAggregate({
			variantId,
			dateRange: { from, to },
			occupancy: Math.floor(occupancy),
			currency,
		})
		if (!aggregate) {
			logEndpoint()
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		logEndpoint()
		return new Response(JSON.stringify(aggregate), {
			status: 200,
			headers: { "Content-Type": "application/json" },
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
