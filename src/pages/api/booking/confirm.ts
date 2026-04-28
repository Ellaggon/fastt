import type { APIRoute } from "astro"
import { z, ZodError } from "zod"
import { and, Booking, BookingRoomDetail, db, eq, InventoryLock, Product, sql } from "astro:db"

import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { invalidateBooking, invalidateProvider, invalidateVariant } from "@/lib/cache/invalidation"
import { createBookingFromHold } from "@/modules/booking/public"
import { bookingFromHoldRepository } from "@/container/booking.container"
import { applyInventoryMutation } from "@/modules/inventory/public"
import { resolveEffectiveTaxFeesUseCase } from "@/container/taxes-fees.container"
import {
	financialRepository,
	registerFinancialShadowWriteUseCase,
} from "@/container/financial.container"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import { getFeatureFlags } from "@/config/featureFlags"
import {
	logFallbackTriggered,
	logFeatureFlagEvaluation,
} from "@/lib/observability/migration-logger"

const schema = z.object({
	holdId: z.string().uuid(),
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
		.get()

	if (!linked?.bookingId) return null
	return {
		bookingId: String(linked.bookingId),
		status: String(linked.status ?? "confirmed"),
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
		const url = new URL(request.url)
		const flags = getFeatureFlags({
			request,
			query: url.searchParams,
		})
		logFeatureFlagEvaluation({
			requestId,
			domain: "booking",
			endpoint: "/api/booking/confirm",
			flags,
			overrides: {
				queryFlag: url.searchParams.get("flag"),
				headerFlag: request.headers.get("x-flag"),
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
			}
		}
		const parsed = schema.parse(payload)
		requestedHoldId = parsed.holdId

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
			.get()
		const providerId = String(product?.providerId ?? "").trim() || null

		await invalidateVariant(result.variantId, result.productId)
		if (providerId) {
			await invalidateProvider(providerId)
		}
		await invalidateBooking(result.bookingId, providerId)

		if (flags.FINANCIAL_SHADOW_WRITE) {
			const baseShadowKey = `financial_shadow:booking_confirm:${result.bookingId}`
			const paymentIntentKey = `financial_shadow:booking_confirm:payment:${result.bookingId}`
			const settlementKey = `financial_shadow:booking_confirm:settlement:${result.bookingId}`
			try {
				const bookingAmounts = await db
					.select({
						currency: Booking.currency,
						totalAmountUSD: Booking.totalAmountUSD,
						totalAmountBOB: Booking.totalAmountBOB,
					})
					.from(Booking)
					.where(eq(Booking.id, result.bookingId))
					.get()
				const bookingDetail = await db
					.select({
						basePrice: BookingRoomDetail.basePrice,
						taxes: BookingRoomDetail.taxes,
						totalPrice: BookingRoomDetail.totalPrice,
					})
					.from(BookingRoomDetail)
					.where(eq(BookingRoomDetail.bookingId, result.bookingId))
					.get()

				const currency = String(bookingAmounts?.currency ?? "USD").trim() || "USD"
				const baseTotal = Number(bookingDetail?.basePrice ?? 0)
				const taxesTotal = Number(bookingDetail?.taxes ?? 0)
				const fallbackFinal =
					currency === "BOB"
						? Number(bookingAmounts?.totalAmountBOB ?? 0)
						: Number(bookingAmounts?.totalAmountUSD ?? 0)
				const finalTotal = Number(bookingDetail?.totalPrice ?? fallbackFinal)

				if (!providerId) {
					incrementCounter("financial.shadow_write.failed", { source: "booking_confirm" }, 1)
					logger.warn("financial.shadow_write.skipped_missing_provider", {
						bookingId: result.bookingId,
						idempotencyKey: baseShadowKey,
						status: "failed",
						finalTotal,
						currency,
					})
				} else {
					const shadowPayload = await registerFinancialShadowWriteUseCase({
						bookingId: result.bookingId,
						providerId,
						grossAmount: finalTotal,
						netAmount: finalTotal,
						commissionAmount: 0,
						currency,
						source: "booking_confirm",
						idempotencyKey: paymentIntentKey,
						metadata: {
							baseTotal,
							taxesTotal,
							finalTotal,
						},
					})

					const paymentSaveResult =
						await financialRepository.savePaymentIntentIfAbsentByIdempotencyKey({
							idempotencyKey: paymentIntentKey,
							record: {
								...shadowPayload.paymentIntent,
								idempotencyKey: paymentIntentKey,
							},
						})
					const settlementSaveResult =
						await financialRepository.saveSettlementRecordIfAbsentByIdempotencyKey({
							idempotencyKey: settlementKey,
							record: {
								...shadowPayload.settlementRecord,
								idempotencyKey: settlementKey,
							},
						})

					const deduped =
						paymentSaveResult === "already_exists" || settlementSaveResult === "already_exists"
					if (deduped) {
						incrementCounter("financial.shadow_write.deduped", { source: "booking_confirm" }, 1)
						logger.debug("financial.shadow_write.deduped", {
							bookingId: result.bookingId,
							idempotencyKey: baseShadowKey,
							paymentIntentKey,
							settlementKey,
							status: "deduped",
							paymentSaveResult,
							settlementSaveResult,
						})
					} else {
						incrementCounter("financial.shadow_write.created", { source: "booking_confirm" }, 1)
						logger.info("financial.shadow_write.created", {
							bookingId: result.bookingId,
							idempotencyKey: baseShadowKey,
							paymentIntentKey,
							settlementKey,
							status: "created",
							paymentSaveResult,
							settlementSaveResult,
						})
					}
				}
			} catch (financialError) {
				incrementCounter("financial.shadow_write.failed", { source: "booking_confirm" }, 1)
				logger.error("financial.shadow_write.failed", {
					bookingId: result.bookingId,
					idempotencyKey: baseShadowKey,
					paymentIntentKey,
					settlementKey,
					status: "failed",
					message:
						financialError instanceof Error ? financialError.message : String(financialError),
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
			return new Response(JSON.stringify({ error: "validation_error", details: error.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		const code = error instanceof Error ? error.message : "INTERNAL_ERROR"
		if (
			code === "HOLD_NOT_FOUND" ||
			code === "HOLD_EXPIRED" ||
			code === "HOLD_ALREADY_CONFIRMED" ||
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
