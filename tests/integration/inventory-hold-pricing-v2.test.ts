import { describe, expect, it } from "vitest"
import {
	Booking,
	BookingRoomDetail,
	db,
	DailyInventory,
	EffectivePricingV2,
	eq,
	RatePlan,
	RatePlanTemplate,
	Variant,
} from "astro:db"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"
import { materializeSearchUnitRange, resolveSearchOffers } from "@/modules/search/public"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"
import { SearchOffersRepository } from "@/modules/search/infrastructure/repositories/SearchOffersRepository"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import * as persistentCache from "@/lib/cache/persistentCache"
import { cacheKeys } from "@/lib/cache/cacheKeys"
import { createPolicyCapa6, assignPolicyCapa6 } from "@/modules/policies/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

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

function makeAuthedFormRequest(params: { path: string; token?: string; form: FormData }): Request {
	const headers = new Headers()
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: params.form,
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

async function seedFixture(params: {
	variantId: string
	productId: string
	ratePlanId: string
	dates: string[]
	includeV2Rows?: boolean
}) {
	const destinationId = `dest_hold_v2_${crypto.randomUUID()}`
	await upsertDestination({
		id: destinationId,
		name: "Hold V2 Dest",
		type: "city",
		country: "CL",
		slug: `hold-v2-${destinationId}`,
	})
	await upsertProduct({
		id: params.productId,
		name: "Hold V2 Product",
		productType: "Hotel",
		destinationId,
		providerId: null,
	})

	await db.insert(Variant).values({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Room V2",
		status: "ready",
		createdAt: new Date(),
		isActive: true,
	} as any)
	const ratePlanTemplateId = `rpt_hold_v2_${crypto.randomUUID()}`
	await db.insert(RatePlanTemplate).values({
		id: ratePlanTemplateId,
		name: "Hold V2 Template",
		paymentType: "pay_at_property",
		refundable: true,
		createdAt: new Date(),
	} as any)
	await db.insert(RatePlan).values({
		id: params.ratePlanId,
		templateId: ratePlanTemplateId,
		variantId: params.variantId,
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)

	const cancellation = await createPolicyCapa6({
		category: "Cancellation",
		description: "Flexible cancellation",
		cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
	} as any)
	const payment = await createPolicyCapa6({
		category: "Payment",
		description: "Pay at property",
		rules: { paymentType: "pay_at_property" },
	} as any)
	const checkIn = await createPolicyCapa6({
		category: "CheckIn",
		description: "Standard check-in",
		rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
	} as any)
	const noShow = await createPolicyCapa6({
		category: "NoShow",
		description: "No-show first night",
		rules: { penaltyType: "first_night" },
	} as any)
	for (const policy of [cancellation, payment, checkIn, noShow]) {
		await assignPolicyCapa6({
			policyId: policy.policyId,
			scope: "rate_plan",
			scopeId: params.ratePlanId,
			channel: "web",
		})
	}

	for (const date of params.dates) {
		await db.insert(DailyInventory).values({
			id: crypto.randomUUID(),
			variantId: params.variantId,
			date,
			totalInventory: 5,
			reservedCount: 0,
			createdAt: new Date(),
		} as any)
		await db.insert(EffectivePricingV2).values({
			id: `epv1_hold_v2_${crypto.randomUUID()}`,
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			date,
			occupancyKey: buildOccupancyKey({ adults: 1, children: 0, infants: 0 }),
			baseComponent: 100,
			occupancyAdjustment: 0,
			ruleAdjustment: 0,
			finalBasePrice: 100,
			currency: "USD",
			computedAt: new Date(),
			sourceVersion: "test",
		} as any)
		if (params.includeV2Rows && EffectivePricingV2 && (EffectivePricingV2 as any).variantId) {
			await db.insert(EffectivePricingV2).values({
				id: `epv2_hold_v2_${crypto.randomUUID()}`,
				variantId: params.variantId,
				ratePlanId: params.ratePlanId,
				date,
				occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
				baseComponent: 90,
				occupancyAdjustment: 10,
				ruleAdjustment: 5,
				finalBasePrice: 105,
				currency: "USD",
				computedAt: new Date(),
				sourceVersion: "test",
			} as any)
		}
	}
}

async function refreshSearchView(
	variantId: string,
	ratePlanId: string,
	from: string,
	to: string,
	options?: { ensureCoverage?: boolean }
) {
	void options
	await recomputeEffectiveAvailabilityRange({
		variantId,
		from,
		to,
		reason: "test_seed",
		idempotencyKey: `hold_v2:${variantId}:${from}:${to}`,
	})
	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from,
		to,
		currency: "USD",
	})
}

describe("integration/hold pricing V2 snapshot", () => {
	const supportsV2Table = Boolean(EffectivePricingV2 && (EffectivePricingV2 as any).variantId)

	;(supportsV2Table ? it : it.skip)(
		"stores V2 pricing breakdown and keeps Search total aligned with Hold and Booking totals",
		async () => {
			const token = "t_hold_v2_ok"
			const variantId = `var_hold_v2_ok_${crypto.randomUUID()}`
			const productId = `prod_hold_v2_ok_${crypto.randomUUID()}`
			const ratePlanId = `rp_hold_v2_ok_${crypto.randomUUID()}`
			const dates = ["2026-11-10", "2026-11-11"]
			await seedFixture({ variantId, productId, ratePlanId, dates, includeV2Rows: true })
			await refreshSearchView(variantId, ratePlanId, "2026-11-10", "2026-11-12")

			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-11-10")
			fd.set("checkOut", "2026-11-12")
			fd.set("occupancy", "2")
			fd.set("sessionId", `s_${crypto.randomUUID()}`)
			const response = await withSupabaseAuthStub(
				{ [token]: { id: "user_hold_v2", email: "hold-v2@example.com" } },
				() =>
					Promise.resolve(
						holdPost({
							request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
						} as any)
					)
			)
			expect(response.status).toBe(200)
			const body = await readJson(response)
			const holdId = String(body?.holdId ?? "")
			expect(holdId.length).toBeGreaterThan(0)
			expect(body?.warnings).toEqual([
				{ code: "hold_legacy_numeric_occupancy_used", severity: "warning" },
			])

			const snapshot = (await persistentCache.get(cacheKeys.holdPricingSnapshot(holdId))) as any
			expect(snapshot?.pricingBreakdownV2).toBeTruthy()
			expect(snapshot?.pricingBreakdownV2?.final).toBe(210)
			expect(snapshot?.occupancyDetail).toEqual({ adults: 2, children: 0, infants: 0 })
			expect(snapshot?.days?.every((day: any) => day?.pricingSource === "v2")).toBe(true)

			const searchResult = await resolveSearchOffers(
				{
					productId,
					checkIn: new Date("2026-11-10T00:00:00.000Z"),
					checkOut: new Date("2026-11-12T00:00:00.000Z"),
					adults: 2,
					children: 0,
					rooms: 1,
					currency: "USD",
				},
				{ repo: new SearchOffersRepository() }
			)
			const offer = searchResult.offers.find((item) => item.variantId === variantId)
			const ratePlan = offer?.ratePlans.find((item) => item.ratePlanId === ratePlanId)
			expect(ratePlan?.totalPrice).toBe(snapshot.totalPrice)

			const confirmForm = new FormData()
			confirmForm.set("holdId", holdId)
			const confirmResponse = await withSupabaseAuthStub(
				{ [token]: { id: "user_hold_v2", email: "hold-v2@example.com" } },
				() =>
					Promise.resolve(
						bookingConfirmPost({
							request: makeAuthedFormRequest({
								path: "/api/booking/confirm",
								token,
								form: confirmForm,
							}),
						} as any)
					)
			)
			expect(confirmResponse.status).toBe(200)
			const confirmBody = await readJson(confirmResponse)
			const bookingId = String(confirmBody?.bookingId ?? "")
			expect(bookingId.length).toBeGreaterThan(0)

			const detail = await db
				.select({
					totalPrice: BookingRoomDetail.totalPrice,
					basePrice: BookingRoomDetail.basePrice,
					pricingBreakdownJson: BookingRoomDetail.pricingBreakdownJson,
				})
				.from(BookingRoomDetail)
				.where(eq(BookingRoomDetail.bookingId, bookingId))
				.get()
			expect(detail).toBeTruthy()
			expect(Number(detail?.basePrice ?? 0)).toBe(snapshot.totalPrice)
			expect(Number(detail?.totalPrice ?? 0)).toBeGreaterThanOrEqual(snapshot.totalPrice)
			expect((detail as any)?.pricingBreakdownJson?.occupancyDetail).toEqual({
				adults: 2,
				children: 0,
				infants: 0,
			})
			expect((detail as any)?.pricingBreakdownJson?.pricingBreakdownV2).toEqual(
				snapshot.pricingBreakdownV2
			)

			const confirmResponseAgain = await withSupabaseAuthStub(
				{ [token]: { id: "user_hold_v2", email: "hold-v2@example.com" } },
				() =>
					Promise.resolve(
						bookingConfirmPost({
							request: makeAuthedFormRequest({
								path: "/api/booking/confirm",
								token,
								form: confirmForm,
							}),
						} as any)
					)
			)
			expect(confirmResponseAgain.status).toBe(200)
			const confirmBodyAgain = await readJson(confirmResponseAgain)
			expect(String(confirmBodyAgain?.bookingId ?? "")).toBe(bookingId)

			const bookingRows = await db.select().from(Booking).where(eq(Booking.id, bookingId)).all()
			expect(bookingRows).toHaveLength(1)
		}
	)

	it("requires explicit V2 coverage before hold pricing snapshot reads", async () => {
		const token = "t_hold_v2_fallback"
		const variantId = `var_hold_v2_fb_${crypto.randomUUID()}`
		const productId = `prod_hold_v2_fb_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_v2_fb_${crypto.randomUUID()}`
		const dates = ["2026-11-20", "2026-11-21"]
		await seedFixture({ variantId, productId, ratePlanId, dates, includeV2Rows: false })
		await ensurePricingCoverageForRequestRuntime({
			variantId,
			ratePlanId,
			checkIn: "2026-11-20",
			checkOut: "2026-11-22",
			occupancy: { adults: 2, children: 0, infants: 0 },
		})
		await refreshSearchView(variantId, ratePlanId, "2026-11-20", "2026-11-22")

		const fd = new FormData()
		fd.set("variantId", variantId)
		fd.set("ratePlanId", ratePlanId)
		fd.set("checkIn", "2026-11-20")
		fd.set("checkOut", "2026-11-22")
		fd.set("occupancy", "2")
		fd.set("sessionId", `s_${crypto.randomUUID()}`)
		const response = await withSupabaseAuthStub(
			{ [token]: { id: "user_hold_v2_fb", email: "hold-v2-fallback@example.com" } },
			() =>
				Promise.resolve(
					holdPost({
						request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
					} as any)
				)
		)
		expect(response.status).toBe(200)
		const body = await readJson(response)
		const holdId = String(body?.holdId ?? "")
		expect(body?.warnings).toEqual([
			{ code: "hold_legacy_numeric_occupancy_used", severity: "warning" },
		])
		const snapshot = (await persistentCache.get(cacheKeys.holdPricingSnapshot(holdId))) as any
		expect(snapshot?.days?.every((day: any) => day?.pricingSource === "v2")).toBe(true)
		expect(snapshot?.totalPrice).toBeGreaterThan(0)
	})

	it("supports legacy snapshot fallback when V2 fields are absent", async () => {
		const token = "t_hold_legacy_fallback"
		const variantId = `var_hold_legacy_${crypto.randomUUID()}`
		const productId = `prod_hold_legacy_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_legacy_${crypto.randomUUID()}`
		const dates = ["2026-12-01", "2026-12-02"]
		await seedFixture({ variantId, productId, ratePlanId, dates, includeV2Rows: false })
		await ensurePricingCoverageForRequestRuntime({
			variantId,
			ratePlanId,
			checkIn: "2026-12-01",
			checkOut: "2026-12-03",
			occupancy: { adults: 2, children: 0, infants: 0 },
		})
		await refreshSearchView(variantId, ratePlanId, "2026-12-01", "2026-12-03")

		const fd = new FormData()
		fd.set("variantId", variantId)
		fd.set("ratePlanId", ratePlanId)
		fd.set("checkIn", "2026-12-01")
		fd.set("checkOut", "2026-12-03")
		fd.set("occupancy", "2")
		fd.set("sessionId", `s_${crypto.randomUUID()}`)
		const holdResponse = await withSupabaseAuthStub(
			{ [token]: { id: "user_hold_legacy", email: "hold-legacy@example.com" } },
			() =>
				Promise.resolve(
					holdPost({
						request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
					} as any)
				)
		)
		expect(holdResponse.status).toBe(200)
		const holdBody = await readJson(holdResponse)
		const holdId = String(holdBody?.holdId ?? "")
		expect(holdId.length).toBeGreaterThan(0)

		const legacySnapshot = {
			ratePlanId,
			currency: "USD",
			occupancy: 2,
			from: "2026-12-01",
			to: "2026-12-03",
			nights: 2,
			totalPrice: 200,
			days: [
				{ date: "2026-12-01", price: 100 },
				{ date: "2026-12-02", price: 100 },
			],
		}
		await persistentCache.set(cacheKeys.holdPricingSnapshot(holdId), legacySnapshot, 10 * 60)

		const confirmForm = new FormData()
		confirmForm.set("holdId", holdId)
		const confirmResponse = await withSupabaseAuthStub(
			{ [token]: { id: "user_hold_legacy", email: "hold-legacy@example.com" } },
			() =>
				Promise.resolve(
					bookingConfirmPost({
						request: makeAuthedFormRequest({
							path: "/api/booking/confirm",
							token,
							form: confirmForm,
						}),
					} as any)
				)
		)
		expect(confirmResponse.status).toBe(200)
		const confirmBody = await readJson(confirmResponse)
		const bookingId = String(confirmBody?.bookingId ?? "")
		expect(bookingId.length).toBeGreaterThan(0)

		const detail = await db
			.select({ pricingBreakdownJson: BookingRoomDetail.pricingBreakdownJson })
			.from(BookingRoomDetail)
			.where(eq(BookingRoomDetail.bookingId, bookingId))
			.get()
		expect(detail).toBeTruthy()
		expect((detail as any)?.pricingBreakdownJson?.pricingBreakdownV2 ?? null).toBeNull()
		expect((detail as any)?.pricingBreakdownJson?.occupancyDetail).toEqual({
			adults: 2,
			children: 0,
			infants: 0,
		})
	})

	it("preserves real multi-occupancy detail in hold snapshot and booking materialization", async () => {
		const token = "t_hold_multi_occ"
		const variantId = `var_hold_multi_occ_${crypto.randomUUID()}`
		const productId = `prod_hold_multi_occ_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_multi_occ_${crypto.randomUUID()}`
		const dates = ["2026-12-10", "2026-12-11"]
		await seedFixture({ variantId, productId, ratePlanId, dates, includeV2Rows: true })
		await ensurePricingCoverageForRequestRuntime({
			variantId,
			ratePlanId,
			checkIn: "2026-12-10",
			checkOut: "2026-12-12",
			occupancy: { adults: 1, children: 1, infants: 0 },
		})
		await refreshSearchView(variantId, ratePlanId, "2026-12-10", "2026-12-12")

		const holdForm = new FormData()
		holdForm.set("variantId", variantId)
		holdForm.set("ratePlanId", ratePlanId)
		holdForm.set("checkIn", "2026-12-10")
		holdForm.set("checkOut", "2026-12-12")
		holdForm.set("rooms", "1")
		holdForm.set("occupancyDetail[adults]", "1")
		holdForm.set("occupancyDetail[children]", "1")
		holdForm.set("occupancyDetail[infants]", "0")
		holdForm.set("sessionId", `s_${crypto.randomUUID()}`)

		const holdResponse = await withSupabaseAuthStub(
			{ [token]: { id: "user_hold_multi_occ", email: "hold-multi-occ@example.com" } },
			() =>
				Promise.resolve(
					holdPost({
						request: makeAuthedFormRequest({
							path: "/api/inventory/hold",
							token,
							form: holdForm,
						}),
					} as any)
				)
		)
		expect(holdResponse.status).toBe(200)
		const holdBody = await readJson(holdResponse)
		const holdId = String(holdBody?.holdId ?? "")
		const snapshot = (await persistentCache.get(cacheKeys.holdPricingSnapshot(holdId))) as any
		expect(snapshot?.occupancyDetail).toEqual({ adults: 1, children: 1, infants: 0 })

		const confirmForm = new FormData()
		confirmForm.set("holdId", holdId)
		const confirmResponse = await withSupabaseAuthStub(
			{ [token]: { id: "user_hold_multi_occ", email: "hold-multi-occ@example.com" } },
			() =>
				Promise.resolve(
					bookingConfirmPost({
						request: makeAuthedFormRequest({
							path: "/api/booking/confirm",
							token,
							form: confirmForm,
						}),
					} as any)
				)
		)
		expect(confirmResponse.status).toBe(200)
		const confirmBody = await readJson(confirmResponse)
		const bookingId = String(confirmBody?.bookingId ?? "")
		const detail = await db
			.select({ pricingBreakdownJson: BookingRoomDetail.pricingBreakdownJson })
			.from(BookingRoomDetail)
			.where(eq(BookingRoomDetail.bookingId, bookingId))
			.get()
		expect((detail as any)?.pricingBreakdownJson?.occupancyDetail).toEqual({
			adults: 1,
			children: 1,
			infants: 0,
		})
		expect((detail as any)?.pricingBreakdownJson?.occupancyDetail).not.toEqual({
			adults: 2,
			children: 0,
			infants: 0,
		})
	})
})
