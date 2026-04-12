import type { APIRoute } from "astro"
import { z, ZodError } from "zod"
import { db, eq, Product } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateBooking, invalidateProvider, invalidateVariant } from "@/lib/cache/invalidation"
import { createBookingFromHold } from "@/modules/booking/public"
import { resolveEffectivePolicies } from "@/modules/policies/public"
import { resolveEffectiveTaxFeesUseCase } from "@/container/taxes-fees.container"

const schema = z.object({
	holdId: z.string().uuid(),
})

export const POST: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	try {
		const user = await getUserFromRequest(request)
		if (!user?.email) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			})
		}

		const contentType = request.headers.get("content-type") ?? ""
		let payload: unknown
		if (contentType.includes("application/json")) {
			payload = await request.json().catch(() => ({}))
		} else {
			const form = await request.formData()
			payload = {
				holdId: String(form.get("holdId") ?? "").trim(),
			}
		}
		const parsed = schema.parse(payload)

		const result = await createBookingFromHold(
			{
				resolveEffectivePolicies: (ctx) => resolveEffectivePolicies(ctx),
				resolveEffectiveTaxFees: (params) => resolveEffectiveTaxFeesUseCase(params),
			},
			{
				holdId: parsed.holdId,
				userId: String((user as any).id ?? "").trim() || null,
				source: "web",
			}
		)

		const product = await db
			.select({ providerId: Product.providerId })
			.from(Product)
			.where(eq(Product.id, result.productId))
			.get()
		const providerId = String(product?.providerId ?? "").trim() || null

		await invalidateVariant(result.variantId, result.productId)
		if (providerId) {
			await invalidateProvider(providerId)
		}
		await invalidateBooking(result.bookingId, providerId)

		console.debug("booking_created", {
			holdId: parsed.holdId,
			bookingId: result.bookingId,
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})

		return new Response(
			JSON.stringify({
				bookingId: result.bookingId,
				status: result.status,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		if (error instanceof ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const code = error instanceof Error ? error.message : "internal_error"
		if (code === "hold_not_found" || code === "hold_expired" || code === "pricing_not_available") {
			return new Response(JSON.stringify({ error: code }), {
				status: 409,
				headers: { "Content-Type": "application/json" },
			})
		}
		return new Response(JSON.stringify({ error: code }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		})
	}
}
