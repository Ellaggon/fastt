import { describe, expect, it } from "vitest"
import {
	Booking,
	BookingPolicySnapshot,
	BookingRoomDetail,
	db,
	eq,
	RefundLedger,
	RefundQuote,
} from "astro:db"

import { POST as executeCancellationPost } from "@/pages/api/booking/cancel"
import { POST as refundQuotePost } from "@/pages/api/internal/financial/refund-quotes"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import type { HoldPolicySnapshot } from "@/modules/policies/public"

type SupabaseTestUser = { id: string; email: string }

function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	fn: () => Promise<T>
) {
	const prevUrl = process.env.SUPABASE_URL
	const prevAnon = process.env.SUPABASE_ANON_KEY
	const prevFetch = globalThis.fetch

	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) return new Response("fetch not mocked", { status: 500 })
		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization
		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })
		return new Response(JSON.stringify({ id: user.id, email: user.email }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as any

	return fn().finally(() => {
		globalThis.fetch = prevFetch
		if (prevUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = prevUrl
		if (prevAnon === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = prevAnon
	})
}

function authedJsonRequest(params: { path: string; token: string; body: unknown }) {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	headers.set("Content-Type", "application/json")
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(params.body),
	})
}

async function readJson<T = any>(response: Response): Promise<T> {
	const text = await response.text()
	return text ? JSON.parse(text) : ({} as T)
}

function policySnapshot(): HoldPolicySnapshot {
	return {
		cancellation: {
			category: "cancellation",
			policyId: "pol_cancel_refund",
			groupId: "grp_cancel_refund",
			version: 1,
			description: "Moderate refund",
			resolvedFromScope: "rate_plan",
			source: {
				policyId: "pol_cancel_refund",
				groupId: "grp_cancel_refund",
				version: 1,
				resolvedFromScope: "rate_plan",
				policyPresetKey: "moderate",
			},
			metadata: {
				policyPresetKey: "moderate",
				stayLengthType: "short_stay",
				gracePeriod: 24,
				refundBasis: "room_rate",
				payoutBasis: "gross",
				localTimezone: "America/Santiago",
				legalOverrideFlags: null,
			},
			calculation: {
				localTimezone: "America/Santiago",
				override: { applied: false, ruleId: null, type: null, reason: null, action: null },
				cancellation: {
					refundTiers: [
						{
							daysBeforeArrival: 7,
							deadlineLocal: "2030-02-03T00:00:00[America/Santiago]",
							penaltyType: "percentage",
							penaltyAmount: 50,
							refundPercent: 50,
							refundBasis: "room_rate",
							taxesFeesBasis: "refund_basis",
							payoutImpact: {
								payoutBasis: "gross",
								hostPayoutPercent: 50,
								platformAbsorbsRefund: false,
							},
						},
					],
					freeCancellationDeadlineLocal: null,
					taxesFeesBasis: "refund_basis",
					payoutImpact: {
						payoutBasis: "gross",
						hostPayoutPercent: 50,
						platformAbsorbsRefund: false,
					},
					stayLength: {
						nights: 2,
						type: "short_stay",
						thresholdNights: 28,
						isLongStay: false,
					},
					gracePeriod: {
						hoursAfterBooking: 24,
						requiresDaysBeforeArrival: 2,
					},
				},
				payment: null,
				noShow: null,
			},
			appliedOverrides: [],
			rules: [],
			cancellationTiers: [],
		},
		payment: null,
		no_show: null,
		check_in: null,
		meta: {
			policyVersionIds: ["pol_cancel_refund"],
			resolvedAt: "2030-01-01T00:00:00.000Z",
			checkIn: "2030-02-10",
			checkOut: "2030-02-12",
			channel: "web",
		},
	}
}

describe("integration/refund cancellation engine", () => {
	it("quotes before cancellation and executes an idempotent refund ledger", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `prov_refund_${suffix}`
		const email = `refund-${suffix}@example.test`
		const token = `token_refund_${suffix}`
		const userId = `user_${email}`
		const destinationId = `dest_refund_${suffix}`
		const productId = `prod_refund_${suffix}`
		const variantId = `var_refund_${suffix}`
		const templateId = `rpt_refund_${suffix}`
		const ratePlanId = `rp_refund_${suffix}`
		const bookingId = `bk_refund_${suffix}`
		const snapshot = policySnapshot()

		await upsertProvider({ id: providerId, displayName: "Refund Provider", ownerEmail: email })
		await upsertDestination({
			id: destinationId,
			name: "Refund Destination",
			type: "city",
			country: "CL",
			slug: `refund-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Refund Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({ id: variantId, productId, kind: "hotel_room", name: "Refund Room" })
		await upsertRatePlanTemplate({ id: templateId, name: "Refund Plan" })
		await upsertRatePlan({
			id: ratePlanId,
			templateId,
			variantId,
			isActive: true,
			isDefault: true,
		})
		await db.insert(Booking).values({
			id: bookingId,
			userId: null,
			ratePlanId,
			checkInDate: new Date("2030-02-10T00:00:00.000Z"),
			checkOutDate: new Date("2030-02-12T00:00:00.000Z"),
			numAdults: 2,
			numChildren: 0,
			status: "confirmed",
			currency: "USD",
			totalAmountUSD: 1000,
			source: "web",
			confirmedAt: new Date("2030-01-01T00:00:00.000Z"),
		} as any)
		await db.insert(BookingRoomDetail).values({
			id: `brd_refund_${suffix}`,
			bookingId,
			variantId,
			ratePlanId,
			checkIn: "2030-02-10",
			checkOut: "2030-02-12",
			adults: 2,
			children: 0,
			basePrice: 900,
			taxes: 100,
			totalPrice: 1000,
			providerIdSnapshot: providerId,
			productIdSnapshot: productId,
			productNameSnapshot: "Refund Hotel",
			variantNameSnapshot: "Refund Room",
			ratePlanNameSnapshot: "Refund Plan",
			pricingBreakdownJson: { totalPrice: 1000, currency: "USD" },
			createdAt: new Date(),
		} as any)
		await db.insert(BookingPolicySnapshot).values({
			id: `bps_refund_${suffix}`,
			bookingId,
			category: "cancellation",
			policyId: "pol_cancel_refund",
			policySnapshotJson: snapshot.cancellation,
			createdAt: new Date(),
		} as any)

		await withSupabaseAuthStub({ [token]: { id: userId, email } }, async () => {
			const quoteResponse = await refundQuotePost({
				request: authedJsonRequest({
					path: "/api/internal/financial/refund-quotes",
					token,
					body: {
						bookingId,
						reason: "guest_cancelled",
						cancelledAt: "2030-02-01T12:00:00.000Z",
						idempotencyKey: `refund_quote:${bookingId}:guest_cancelled`,
					},
				}),
			} as any)
			expect(quoteResponse.status).toBe(201)
			const quoteBody = await readJson(quoteResponse)
			expect(quoteBody.quote).toEqual(
				expect.objectContaining({
					bookingId,
					providerId,
					status: "quoted",
					refundAmount: 500,
					nonRefundableAmount: 500,
					taxFeeRefundAmount: 50,
				})
			)

			const duplicateQuoteResponse = await refundQuotePost({
				request: authedJsonRequest({
					path: "/api/internal/financial/refund-quotes",
					token,
					body: {
						bookingId,
						reason: "guest_cancelled",
						cancelledAt: "2030-02-01T12:00:00.000Z",
						idempotencyKey: `refund_quote:${bookingId}:guest_cancelled`,
					},
				}),
			} as any)
			expect(duplicateQuoteResponse.status).toBe(200)
			const duplicateQuoteBody = await readJson(duplicateQuoteResponse)
			expect(duplicateQuoteBody.created).toBe(false)
			expect(duplicateQuoteBody.quote.id).toBe(quoteBody.quote.id)

			const executeResponse = await executeCancellationPost({
				request: authedJsonRequest({
					path: "/api/booking/cancel",
					token,
					body: {
						bookingId,
						refundQuoteId: quoteBody.quote.id,
						cancelledAt: "2030-02-01T13:00:00.000Z",
						externalReference: "psp_refund_1",
					},
				}),
			} as any)
			expect(executeResponse.status).toBe(200)
			const executeBody = await readJson(executeResponse)
			expect(executeBody.status).toBe("cancelled")
			expect(executeBody.ledger).toEqual(
				expect.objectContaining({
					refundQuoteId: quoteBody.quote.id,
					bookingId,
					providerId,
					status: "recorded",
					refundAmount: 500,
				})
			)

			const duplicateExecuteResponse = await executeCancellationPost({
				request: authedJsonRequest({
					path: "/api/booking/cancel",
					token,
					body: {
						bookingId,
						refundQuoteId: quoteBody.quote.id,
						cancelledAt: "2030-02-01T13:00:00.000Z",
						externalReference: "psp_refund_1",
					},
				}),
			} as any)
			expect(duplicateExecuteResponse.status).toBe(200)
			const duplicateExecuteBody = await readJson(duplicateExecuteResponse)
			expect(duplicateExecuteBody.ledger.id).toBe(executeBody.ledger.id)
		})

		const booking = await db
			.select({
				status: Booking.status,
				refundHandoffSnapshotJson: Booking.refundHandoffSnapshotJson,
			})
			.from(Booking)
			.where(eq(Booking.id, bookingId))
			.get()
		expect(booking?.status).toBe("cancelled")
		expect((booking as any)?.refundHandoffSnapshotJson?.state).toBe("ledger_recorded")

		const quotes = await db
			.select()
			.from(RefundQuote)
			.where(eq(RefundQuote.bookingId, bookingId))
			.all()
		const ledgers = await db
			.select()
			.from(RefundLedger)
			.where(eq(RefundLedger.bookingId, bookingId))
			.all()
		expect(quotes).toHaveLength(1)
		expect(ledgers).toHaveLength(1)
	})
})
