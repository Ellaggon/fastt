import { describe, expect, it } from "vitest"
import { Booking, BookingPolicySnapshot, DailyInventory, Hold, db, eq } from "astro:db"

import { inventoryHoldRepository } from "@/container"
import { snapshotPoliciesForBookingUseCase } from "@/container/booking-policy-snapshot.container"
import { resolvePolicyExceptionRulesUseCase } from "@/container/policy-exceptions.container"
import { createInventoryHold } from "@/modules/inventory/public"
import {
	assignPolicyCapa6,
	createPolicyCapa6,
	resolveEffectivePolicies,
	type HoldPolicySnapshot,
} from "@/modules/policies/public"
import { GET, POST } from "@/pages/api/internal/policies/exceptions"
import { PATCH } from "@/pages/api/internal/policies/exceptions/[id]"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"

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

function authedJsonRequest(params: {
	path: string
	token: string
	method: "GET" | "POST" | "PATCH"
	body?: unknown
}) {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	if (params.body !== undefined) headers.set("Content-Type", "application/json")
	return new Request(`http://localhost:4321${params.path}`, {
		method: params.method,
		headers,
		body: params.body === undefined ? undefined : JSON.stringify(params.body),
	})
}

async function readJson<T = any>(response: Response): Promise<T> {
	const text = await response.text()
	return text ? JSON.parse(text) : ({} as T)
}

function stayDates(from: string, to: string): string[] {
	const out: string[] = []
	const cursor = new Date(`${from}T00:00:00.000Z`)
	const end = new Date(`${to}T00:00:00.000Z`)
	while (cursor < end) {
		out.push(cursor.toISOString().slice(0, 10))
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	}
	return out
}

async function seedBookableRatePlan(params: {
	productId: string
	variantId: string
	ratePlanId: string
	templateId: string
	destinationId: string
	checkIn: string
	checkOut: string
}) {
	await upsertDestination({
		id: params.destinationId,
		name: "Policy Override Destination",
		type: "city",
		country: "CL",
		slug: `policy-override-${params.destinationId}`,
	})
	await upsertProduct({
		id: params.productId,
		name: "Policy Override Product",
		productType: "Hotel",
		destinationId: params.destinationId,
	})
	await upsertVariant({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Override Room",
	})
	await upsertRatePlanTemplate({
		id: params.templateId,
		name: "Canonical",
	})
	await upsertRatePlan({
		id: params.ratePlanId,
		templateId: params.templateId,
		variantId: params.variantId,
		isActive: true,
		isDefault: true,
		baseAmount: 200,
		baseCurrency: "USD",
	})
	for (const date of [...stayDates(params.checkIn, params.checkOut), params.checkOut]) {
		await db.insert(DailyInventory).values({
			id: `di_per_${crypto.randomUUID()}`,
			variantId: params.variantId,
			date,
			totalInventory: 3,
			reservedCount: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)
	}
}

describe("integration/policy exception rules CAPA6", () => {
	it("creates internal overrides and materializes them in hold and booking snapshots", async () => {
		const suffix = crypto.randomUUID()
		const token = `token_per_${suffix}`
		const adminEmail = "ellaggon@proton.me"
		const destinationId = `dest_per_${suffix}`
		const productId = `prod_per_${suffix}`
		const variantId = `var_per_${suffix}`
		const templateId = `rpt_per_${suffix}`
		const ratePlanId = `rp_per_${suffix}`
		const bookingId = `bk_per_${suffix}`
		const checkIn = "2030-04-10"
		const checkOut = "2030-04-12"

		await seedBookableRatePlan({
			productId,
			variantId,
			ratePlanId,
			templateId,
			destinationId,
			checkIn,
			checkOut,
		})

		const cancellation = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Cancellation",
			description: "Strict cancellation",
			refundBasis: "room_rate",
			payoutBasis: "gross",
			localTimezone: "America/Santiago",
			cancellationTiers: [{ daysBeforeArrival: 2, penaltyType: "percentage", penaltyAmount: 100 }],
		} as any)
		await assignPolicyCapa6({
			policyId: cancellation.policyId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			channel: "web",
		})

		const created = await withSupabaseAuthStub(
			{ [token]: { id: `admin_${suffix}`, email: adminEmail } },
			async () => {
				const createResponse = await POST({
					request: authedJsonRequest({
						path: "/api/internal/policies/exceptions",
						token,
						method: "POST",
						body: {
							type: "major_disruptive_event",
							scope: "rate_plan",
							scopeId: ratePlanId,
							category: "Cancellation",
							priority: 1,
							effectiveFrom: checkIn,
							reason: "Emergency platform override",
							action: {
								refundOverridePercent: 100,
								forceRefundBasis: "total_booking_amount",
								payoutOverrideBasis: "platform_absorbs",
								note: "Ticket SUP-100 confirms guest receives full refund",
							},
						},
					}),
				} as any)
				expect(createResponse.status).toBe(201)
				const createBody = await readJson(createResponse)
				expect(createBody.item).toEqual(
					expect.objectContaining({
						type: "major_disruptive_event",
						scope: "rate_plan",
						scopeId: ratePlanId,
						category: "Cancellation",
						isActive: true,
					})
				)

				const listUrl = new URL(
					`http://localhost:4321/api/internal/policies/exceptions?scope=rate_plan&scopeId=${ratePlanId}`
				)
				const listResponse = await GET({
					request: authedJsonRequest({
						path: listUrl.pathname + listUrl.search,
						token,
						method: "GET",
					}),
					url: listUrl,
				} as any)
				expect(listResponse.status).toBe(200)
				const listBody = await readJson(listResponse)
				expect(listBody.items.map((item: any) => item.id)).toContain(createBody.item.id)
				return createBody.item
			}
		)

		const hold = await createInventoryHold(
			{
				repo: inventoryHoldRepository,
				resolveEffectivePolicies: (ctx) => resolveEffectivePolicies(ctx),
				resolvePolicyExceptionRules: resolvePolicyExceptionRulesUseCase,
				policyContext: {
					productId,
					ratePlanId,
					channel: "web",
				},
				resolvePricingSnapshot: async () => ({
					ratePlanId,
					currency: "USD",
					occupancy: 1,
					occupancyDetail: { adults: 1, children: 0, infants: 0 },
					from: checkIn,
					to: checkOut,
					nights: 2,
					totalPrice: 400,
					days: [
						{ date: "2030-04-10", price: 200 },
						{ date: "2030-04-11", price: 200 },
					],
				}),
			},
			{
				variantId,
				dateRange: { from: checkIn, to: checkOut },
				rooms: 1,
				sessionId: `sess_per_${suffix}`,
			}
		)

		const holdRow = await db
			.select({ policySnapshotJson: Hold.policySnapshotJson })
			.from(Hold)
			.where(eq(Hold.id, hold.holdId))
			.get()
		const holdSnapshot = holdRow?.policySnapshotJson as HoldPolicySnapshot
		expect(holdSnapshot.cancellation?.appliedOverrides?.[0]).toEqual(
			expect.objectContaining({
				id: created.id,
				type: "major_disruptive_event",
				reason: "Emergency platform override",
			})
		)
		expect(holdSnapshot.cancellation?.calculation?.cancellation?.refundTiers[0]).toEqual(
			expect.objectContaining({
				penaltyType: "percentage",
				penaltyAmount: 0,
				refundPercent: 100,
				refundBasis: "total_booking_amount",
			})
		)
		expect(
			holdSnapshot.cancellation?.calculation?.cancellation?.refundTiers[0]?.payoutImpact
		).toEqual(
			expect.objectContaining({
				payoutBasis: "platform_absorbs",
				hostPayoutPercent: 0,
				platformAbsorbsRefund: true,
			})
		)

		await db.insert(Booking).values({
			id: bookingId,
			userId: null,
			ratePlanId,
			checkInDate: new Date(`${checkIn}T00:00:00.000Z`),
			checkOutDate: new Date(`${checkOut}T00:00:00.000Z`),
			numAdults: 1,
			numChildren: 0,
			status: "confirmed",
			source: "web",
		} as any)

		await snapshotPoliciesForBookingUseCase({
			bookingId,
			productId,
			variantId,
			ratePlanId,
			channel: "web",
			checkIn,
			checkOut,
		})

		const bookingSnapshot = await db
			.select()
			.from(BookingPolicySnapshot)
			.where(eq(BookingPolicySnapshot.bookingId, bookingId))
			.get()
		expect((bookingSnapshot as any)?.policySnapshotJson?.appliedOverrides?.[0]?.id).toBe(created.id)
		expect(
			(bookingSnapshot as any)?.policySnapshotJson?.calculation?.cancellation?.refundTiers?.[0]
				?.refundPercent
		).toBe(100)

		await withSupabaseAuthStub(
			{ [token]: { id: `admin_${suffix}`, email: adminEmail } },
			async () => {
				const patchResponse = await PATCH({
					params: { id: created.id },
					request: authedJsonRequest({
						path: `/api/internal/policies/exceptions/${created.id}`,
						token,
						method: "PATCH",
						body: { isActive: false },
					}),
				} as any)
				expect(patchResponse.status).toBe(200)
				const patchBody = await readJson(patchResponse)
				expect(patchBody.item.isActive).toBe(false)
			}
		)

		const applicableAfterDisable = await resolvePolicyExceptionRulesUseCase({
			productId,
			variantId,
			ratePlanId,
			checkIn,
			checkOut,
			channel: "web",
		})
		expect(applicableAfterDisable.map((item) => item.id)).not.toContain(created.id)
	})
})
