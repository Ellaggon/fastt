import type { APIRoute } from "astro"
import { ZodError, z } from "zod"
import { and, db, eq, RatePlan } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateVariant } from "@/lib/cache/invalidation"
import { getAvailabilityAggregate } from "@/modules/catalog/public"
import { createInventoryHold } from "@/modules/inventory/public"
import { inventoryHoldRepository, variantManagementRepository } from "@/container"

const schema = z.object({
	variantId: z.string().min(1),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	occupancy: z.number().int().min(1),
	sessionId: z.string().min(1).optional(),
})

function optionalTrimmed(value: unknown): string | undefined {
	const s = String(value ?? "").trim()
	return s.length > 0 ? s : undefined
}

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
			const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
			payload = {
				variantId: String(raw.variantId ?? "").trim(),
				dateRange: {
					from: String((raw as any)?.dateRange?.from ?? raw.checkIn ?? raw.from ?? "").trim(),
					to: String((raw as any)?.dateRange?.to ?? raw.checkOut ?? raw.to ?? "").trim(),
				},
				occupancy: Number(raw.occupancy ?? raw.quantity ?? 1),
				sessionId: optionalTrimmed(raw.sessionId ?? request.headers.get("x-session-id")),
			}
		} else {
			const form = await request.formData()
			payload = {
				variantId: String(form.get("variantId") ?? "").trim(),
				dateRange: {
					from: String(form.get("checkIn") ?? form.get("from") ?? "").trim(),
					to: String(form.get("checkOut") ?? form.get("to") ?? "").trim(),
				},
				occupancy: Number(form.get("occupancy") ?? form.get("quantity") ?? 1),
				sessionId: optionalTrimmed(form.get("sessionId")),
			}
		}
		const parsed = schema.parse(payload)
		const effectiveSessionId =
			String(parsed.sessionId ?? "").trim() ||
			String(request.headers.get("x-session-id") ?? "").trim() ||
			String((user as any).id ?? "").trim() ||
			String(user.email ?? "").trim()
		if (!effectiveSessionId) {
			return new Response(
				JSON.stringify({ error: "validation_error", details: [{ path: ["sessionId"] }] }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			)
		}

		const result = await createInventoryHold(
			{
				repo: inventoryHoldRepository,
				resolvePricingSnapshot: async ({ variantId, from, to, occupancy }) => {
					const currency = "USD"
					const availability = await getAvailabilityAggregate({
						variantId,
						dateRange: { from, to },
						occupancy,
						currency,
					})
					if (!availability) return null
					if (!availability.summary.sellable || availability.summary.totalPrice == null) return null
					if (availability.days.some((day) => day.price == null)) return null

					const defaultRatePlan = await db
						.select({ id: RatePlan.id })
						.from(RatePlan)
						.where(
							and(
								eq(RatePlan.variantId, variantId),
								eq(RatePlan.isDefault, true),
								eq(RatePlan.isActive, true)
							)
						)
						.get()
					if (!defaultRatePlan?.id) return null

					return {
						ratePlanId: defaultRatePlan.id,
						currency,
						occupancy,
						from,
						to,
						nights: availability.summary.nights,
						totalPrice: availability.summary.totalPrice,
						days: availability.days.map((day) => ({
							date: day.date,
							price: day.price,
						})),
					}
				},
			},
			{
				variantId: parsed.variantId,
				dateRange: parsed.dateRange,
				occupancy: parsed.occupancy,
				sessionId: effectiveSessionId,
			}
		)

		const variant = await variantManagementRepository.getVariantById(parsed.variantId)
		if (variant) {
			await invalidateVariant(parsed.variantId, variant.productId)
		}

		console.debug("inventory_hold_created", {
			variantId: parsed.variantId,
			holdId: result.holdId,
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})

		return new Response(
			JSON.stringify({ holdId: result.holdId, expiresAt: result.expiresAt.toISOString() }),
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
		if (e instanceof Error && e.message === "not_available") {
			return new Response(JSON.stringify({ error: "not_available" }), {
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
