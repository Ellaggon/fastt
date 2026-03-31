import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import {
	dailyInventoryRepository,
	productRepository,
	variantManagementRepository,
} from "@/container"

const schema = z.object({
	variantId: z.string().min(1),
	startDate: z.string().min(1),
	endDate: z.string().min(1),
})

function parseISODate(s: string): Date | null {
	const d = new Date(s)
	return Number.isNaN(d.getTime()) ? null : d
}

export const GET: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const providerId = await getProviderIdFromRequest(request)
		if (!providerId) {
			return new Response(JSON.stringify({ error: "Unauthorized / not a provider" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const url = new URL(request.url)
		const parsed = schema.parse({
			variantId: String(url.searchParams.get("variantId") ?? "").trim(),
			startDate: String(url.searchParams.get("startDate") ?? "").trim(),
			endDate: String(url.searchParams.get("endDate") ?? "").trim(),
		})

		const start = parseISODate(parsed.startDate)
		const end = parseISODate(parsed.endDate)
		if (!start || !end || end <= start) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["dates"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const v = await variantManagementRepository.getVariantById(parsed.variantId)
		if (!v) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const owned = await productRepository.ensureProductOwnedByProvider(v.productId, providerId)
		if (!owned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}

		const rows = await dailyInventoryRepository.getRange(parsed.variantId, start, end)

		const out = rows.map((r: any) => {
			const totalInventory = Number(r.totalInventory ?? 0)
			const reservedCount = Number(r.reservedCount ?? 0)
			const stopSell = Boolean(r.stopSell ?? false)
			const available = stopSell ? 0 : totalInventory - reservedCount
			return {
				date: String(r.date),
				totalInventory,
				reservedCount,
				available,
				stopSell,
			}
		})

		return new Response(JSON.stringify(out), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	} catch (e) {
		if (e instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: e.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const msg = e instanceof Error ? e.message : "Unknown error"
		return new Response(JSON.stringify({ error: msg }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
