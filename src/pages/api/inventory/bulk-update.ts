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
	totalInventory: z.number().int().min(0).optional(),
	stopSell: z.boolean().optional(),
})

function parseISODate(s: string): Date | null {
	const d = new Date(s)
	return Number.isNaN(d.getTime()) ? null : d
}

export const POST: APIRoute = async ({ request }) => {
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

		const form = await request.formData()

		const stopSellRaw = form.get("stopSell")
		const totalInvRaw = form.get("totalInventory")

		const parsed = schema.parse({
			variantId: String(form.get("variantId") ?? "").trim(),
			startDate: String(form.get("startDate") ?? "").trim(),
			endDate: String(form.get("endDate") ?? "").trim(),
			totalInventory:
				totalInvRaw == null || String(totalInvRaw).trim() === "" ? undefined : Number(totalInvRaw),
			stopSell:
				stopSellRaw == null || String(stopSellRaw).trim() === ""
					? undefined
					: String(stopSellRaw).trim() === "true",
		})

		if (parsed.totalInventory === undefined && parsed.stopSell === undefined) {
			return new Response(
				JSON.stringify({
					error: "validation_error",
					details: [{ path: ["totalInventory"], message: "No changes provided" }],
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } }
			)
		}

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

		await dailyInventoryRepository.bulkUpsertOperational({
			variantId: parsed.variantId,
			startDate: start,
			endDate: end,
			totalInventory: parsed.totalInventory,
			stopSell: parsed.stopSell,
		} as any)

		return new Response(JSON.stringify({ ok: true }), {
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
