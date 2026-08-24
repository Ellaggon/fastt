import type { APIRoute } from "astro"
import { z, ZodError } from "zod"
import {
	first,
	and,
	Booking,
	db,
	eq,
	InventoryLock,
	Product,
	sql,
	Variant,
} from "@/shared/infrastructure/db/compat"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateBooking, invalidateProvider, invalidateVariant } from "@/lib/cache/invalidation"
import { assertProviderCapability } from "@/lib/provider-governance"
import { createBookingFromHold } from "@/modules/booking/public"
import { bookingFromHoldRepository } from "@/container/booking.container"
import { tourTrustRepository } from "@/container"
import { applyInventoryMutation } from "@/modules/inventory/public"
import { resolveEffectiveTaxFeesUseCase } from "@/container/taxes-fees.container"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import { getFeatureFlags } from "@/config/featureFlags"
import {
	logFallbackTriggered,
	logFeatureFlagEvaluation,
} from "@/lib/observability/migration-logger"
import {
	recordTourConfirm,
	recordTourVoucher,
	toursCheckoutEnabled,
} from "@/lib/tours/tourObservability"
import { recordMarketplaceEvent } from "@/modules/catalog/public"

const schema = z.object({
	holdId: z.string().uuid(),
	priceQuoteId: z
		.string()
		.regex(/^pq_[a-f0-9]{32}$/)
		.optional()
		.nullable(),
	/** Optional cross-sell attribution funnel close (hotel → tour). */
	marketplaceAttribution: z
		.object({
			surface: z.string().trim().min(1).max(80),
			sourceProductId: z.string().trim().min(1).optional().nullable(),
			targetProductId: z.string().trim().min(1).optional().nullable(),
			geoPlaceId: z.string().trim().min(1).optional().nullable(),
			sessionId: z.string().trim().min(1).max(120).optional().nullable(),
		})
		.optional()
		.nullable(),
})
const bookingConfirmQueues = new Map<string, Promise<unknown>>()

function isSqliteBusyError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error)
	const code = (error as any)?.code
	return (
		code === "SQLITE_BUSY" ||
		code === "SQLITE_BUSY_SNAPSHOT" ||
		msg.includes("SQLITE_BUSY") ||
		msg.includes("database is locked")
	)
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms))
}

async function findLinkedBookingByHold(
	holdId: string
): Promise<{ bookingId: string; status: string } | null> {
	const linked = await db
		.select({
			bookingId: InventoryLock.bookingId,
			status: Booking.status,
		})
		.from(InventoryLock)
		.leftJoin(Booking, eq(Booking.id, InventoryLock.bookingId))
		.where(and(eq(InventoryLock.holdId, holdId), sql`${InventoryLock.bookingId} is not null`))
		.then(first)

	if (!linked?.bookingId) return null
	return {
		bookingId: String(linked.bookingId),
		status: String(linked.status ?? "confirmed"),
	}
}

async function findHoldMeta(holdId: string): Promise<{
	providerId: string | null
	isTourSlot: boolean
}> {
	const row = await db
		.select({
			providerId: Product.providerId,
			variantKind: Variant.kind,
			productType: Product.productType,
		})
		.from(InventoryLock)
		.leftJoin(Variant, eq(Variant.id, InventoryLock.variantId))
		.leftJoin(Product, eq(Product.id, Variant.productId))
		.where(eq(InventoryLock.holdId, holdId))
		.then(first)
	const productType = String(row?.productType ?? "").toLowerCase()
	const variantKind = String(row?.variantKind ?? "").toLowerCase()
	return {
		providerId: String(row?.providerId ?? "").trim() || null,
		isTourSlot: variantKind === "tour_slot" || productType === "tour",
	}
}

async function serializeBookingConfirm<T>(holdId: string, fn: () => Promise<T>): Promise<T> {
	const prev = bookingConfirmQueues.get(holdId) ?? Promise.resolve()
	const current = prev.catch(() => undefined).then(fn)
	bookingConfirmQueues.set(
		holdId,
		current.then(
			() => undefined,
			() => undefined
		)
	)
	try {
		return await current
	} finally {
		const queued = bookingConfirmQueues.get(holdId)
		if (queued === current || !queued) {
			bookingConfirmQueues.delete(holdId)
		}
	}
}

export const POST: APIRoute = async ({ request }) => {
	const startedAt = performance.now()
	const requestId = String(request.headers.get("x-request-id") ?? crypto.randomUUID()).trim()
	let requestedHoldId: string | null = null
	let busyRecoveryAttempts = 0
	try {
		// Tours kill-switches are env-only; do not resolve from guest request.
		const flags = getFeatureFlags()
		logFeatureFlagEvaluation({
			requestId,
			domain: "booking",
			endpoint: "/api/booking/confirm",
			flags,
			overrides: {
				queryFlag: null,
				headerFlag: null,
			},
		})

		const user = await getUserFromRequest(request)

		const contentType = request.headers.get("content-type") ?? ""
		let payload: unknown
		if (contentType.includes("application/json")) {
			payload = await request.json().catch(() => ({}))
		} else {
			const form = await request.formData()
			payload = {
				holdId: String(form.get("holdId") ?? "").trim(),
				priceQuoteId: String(form.get("priceQuoteId") ?? "").trim() || undefined,
			}
		}
		const parsed = schema.parse(payload)
		requestedHoldId = parsed.holdId
		const holdMeta = await findHoldMeta(parsed.holdId)
		const providerIdForHold = holdMeta.providerId
		if (!providerIdForHold) throw new Error("PROVIDER_OWNERSHIP_REQUIRED")
		const confirmHost = (() => {
			try {
				return new URL(request.url).host
			} catch {
				return null
			}
		})()
		const tourMetricCtx = {
			providerId: providerIdForHold,
			subject: { providerId: providerIdForHold, host: confirmHost },
		}
		if (
			holdMeta.isTourSlot &&
			!toursCheckoutEnabled({
				providerId: providerIdForHold,
				host: confirmHost,
			})
		) {
			recordTourConfirm("disabled", "canary_or_kill_switch", tourMetricCtx)
			return new Response(
				JSON.stringify({
					error: "tours_checkout_disabled",
					message: "Tour checkout is temporarily disabled.",
				}),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		await assertProviderCapability({
			providerId: providerIdForHold,
			currentUserId: user?.id ?? null,
			capability: "booking",
		})

		const result = await serializeBookingConfirm(parsed.holdId, async () =>
			applyInventoryMutation({
				mutate: async () =>
					createBookingFromHold(
						{
							repository: bookingFromHoldRepository,
							resolveEffectiveTaxFees: (params) => resolveEffectiveTaxFeesUseCase(params),
						},
						{
							holdId: parsed.holdId,
							priceQuoteId: parsed.priceQuoteId,
							userId: String((user as any)?.id ?? "").trim() || null,
							source: "web",
						}
					),
				recompute: (bookingResult) => ({
					variantId: bookingResult.variantId,
					from: bookingResult.availabilityRange.from,
					to: bookingResult.availabilityRange.to,
					reason: "booking_confirm",
					idempotencyKey: `booking_confirm:${bookingResult.bookingId}`,
				}),
				logContext: {
					action: "booking_confirm",
					holdId: parsed.holdId,
				},
				// Booking confirm is idempotent; under SQLite write contention we prioritize
				// successful booking response and keep eventual consistency via later recomputes.
				failSoft: true,
			})
		)

		const product = await db
			.select({ providerId: Product.providerId })
			.from(Product)
			.where(eq(Product.id, result.productId))
			.then(first)
		const providerId = String(product?.providerId ?? "").trim() || null

		await invalidateVariant(result.variantId, result.productId)
		if (providerId) {
			await invalidateProvider(providerId)
		}
		await invalidateBooking(result.bookingId, providerId)

		if (holdMeta.isTourSlot) {
			if (result.idempotent) {
				recordTourConfirm("idempotent", "hold_already_confirmed", tourMetricCtx)
			} else {
				recordTourConfirm("success", undefined, tourMetricCtx)
				recordTourVoucher("issued", "success", tourMetricCtx)
			}
		}

		let marketplaceAttributed = false
		const attribution = parsed.marketplaceAttribution
		if (attribution && user?.id && holdMeta.isTourSlot) {
			try {
				const attributed = await recordMarketplaceEvent(
					{ repo: tourTrustRepository },
					{
						eventType: "booking_attributed",
						surface: attribution.surface,
						sourceProductId: attribution.sourceProductId ?? null,
						targetProductId: attribution.targetProductId ?? result.productId,
						geoPlaceId: attribution.geoPlaceId ?? null,
						bookingId: result.bookingId,
						sessionId: attribution.sessionId ?? null,
						userId: user.id,
					}
				)
				marketplaceAttributed = attributed.ok
			} catch (error) {
				// Attribution must never fail the commercial confirm path.
				logger.warn("booking.confirm_attribution_failed", {
					bookingId: result.bookingId,
					message: error instanceof Error ? error.message : String(error),
				})
			}
		}

		logger.info("booking.confirm", {
			holdId: parsed.holdId,
			bookingId: result.bookingId,
			result: "success",
			retries: 0,
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})

		return new Response(
			JSON.stringify({
				bookingId: result.bookingId,
				status: result.status,
				priceQuoteId: parsed.priceQuoteId ?? null,
				marketplaceAttributed,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (error) {
		if (requestedHoldId && isSqliteBusyError(error)) {
			incrementCounter("sqlite_busy_total", { phase: "booking_confirm" })
			incrementCounter("booking_confirm_retry_total", { phase: "recovery" })
			// Concurrent confirm can race with the tx that links hold->booking.
			// Poll briefly to return idempotent success instead of transient 500.
			let linked = await findLinkedBookingByHold(requestedHoldId)
			for (let attempt = 1; !linked && attempt <= 8; attempt++) {
				busyRecoveryAttempts = attempt
				await sleep(50 * attempt)
				linked = await findLinkedBookingByHold(requestedHoldId)
			}
			if (linked) {
				logFallbackTriggered({
					requestId,
					domain: "booking",
					endpoint: "/api/booking/confirm",
					reason: "sqlite_busy_recovered",
					path: "POST /api/booking/confirm",
					durationMs: Number((performance.now() - startedAt).toFixed(1)),
				})
				logger.info("booking.confirm", {
					holdId: requestedHoldId,
					bookingId: linked.bookingId,
					result: "recovered",
					recoveryAttempts: busyRecoveryAttempts,
					durationMs: Number((performance.now() - startedAt).toFixed(1)),
				})
				const recoveredMeta = await findHoldMeta(requestedHoldId)
				if (recoveredMeta.isTourSlot) {
					recordTourConfirm("recovered", "sqlite_busy_recovered")
				}
				return new Response(
					JSON.stringify({
						bookingId: linked.bookingId,
						status: linked.status,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					}
				)
			}
		}
		logFallbackTriggered({
			requestId,
			domain: "booking",
			endpoint: "/api/booking/confirm",
			reason: "confirm_failed",
			path: "POST /api/booking/confirm",
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})
		logger.error("booking.confirm_failed", {
			holdId: requestedHoldId,
			message: error instanceof Error ? error.message : String(error),
			durationMs: Number((performance.now() - startedAt).toFixed(1)),
		})
		if (error instanceof ZodError) {
			if (requestedHoldId) {
				const meta = await findHoldMeta(requestedHoldId).catch(() => ({ isTourSlot: false }))
				if (meta.isTourSlot) recordTourConfirm("failure", "validation_error")
			}
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (error instanceof Error && error.message.startsWith("PROVIDER_CONFIGURATION_BLOCKED")) {
			if (requestedHoldId) {
				const meta = await findHoldMeta(requestedHoldId).catch(() => ({ isTourSlot: false }))
				if (meta.isTourSlot) recordTourConfirm("failure", "provider_configuration_blocked")
			}
			return new Response(
				JSON.stringify({
					error: "provider_configuration_blocked",
					...(error as any).details,
				}),
				{
					status: 423,
					headers: { "Content-Type": "application/json" },
				}
			)
		}
		const code = error instanceof Error ? error.message : "INTERNAL_ERROR"
		if (requestedHoldId) {
			const meta = await findHoldMeta(requestedHoldId).catch(() => ({ isTourSlot: false }))
			if (meta.isTourSlot) {
				if (code === "HOLD_ALREADY_CONFIRMED") {
					recordTourConfirm("idempotent", code)
				} else {
					recordTourConfirm("failure", code)
				}
			}
		}
		if (
			code === "HOLD_NOT_FOUND" ||
			code === "HOLD_EXPIRED" ||
			code === "HOLD_ALREADY_CONFIRMED" ||
			code === "PRICE_QUOTE_MISMATCH" ||
			code === "INVENTORY_CONFLICT"
		) {
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
