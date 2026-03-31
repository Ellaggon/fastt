import type { APIRoute } from "astro"
import { ZodError, z } from "zod"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { holdInventory } from "@/modules/inventory/public"
import { inventoryHoldRepository } from "@/container"

const schema = z.object({
	variantId: z.string().min(1),
	checkIn: z.string().min(1),
	checkOut: z.string().min(1),
	quantity: z.number().int().min(1),
})

export const POST: APIRoute = async ({ request }) => {
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const form = await request.formData()
		const parsed = schema.parse({
			variantId: String(form.get("variantId") ?? "").trim(),
			checkIn: String(form.get("checkIn") ?? "").trim(),
			checkOut: String(form.get("checkOut") ?? "").trim(),
			quantity: Number(form.get("quantity")),
		})

		const checkIn = new Date(parsed.checkIn)
		const checkOut = new Date(parsed.checkOut)
		if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["dates"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const holdId = crypto.randomUUID()
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

		const result = await holdInventory(
			{ repo: inventoryHoldRepository },
			{
				variantId: parsed.variantId,
				checkIn,
				checkOut,
				quantity: parsed.quantity,
				holdId,
				expiresAt,
			}
		)

		if (!result.success) {
			return new Response(JSON.stringify({ error: "not_available" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}

		return new Response(
			JSON.stringify({ holdId: result.holdId, expiresAt: expiresAt.toISOString() }),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
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
