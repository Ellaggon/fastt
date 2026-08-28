import { describe, expect, it } from "vitest"
import {
	Booking,
	BookingLineItem,
	db,
	DailyInventory,
	EffectivePricing,
	eq,
	Hold,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"
import { materializeSearchUnitRange, resolveSearchOffers } from "@/modules/search/public"
import { createSearchOffersRepositoryForTests } from "@/modules/search/testing-public"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"
import { upsertGeoPlace, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { createPolicyCapa6, replacePolicyAssignmentCapa6 } from "@/modules/policies/public"
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

async function readHoldCommercialSnapshot(holdId: string) {
	return db
		.select({ commercialSnapshotJson: Hold.commercialSnapshotJson })
		.from(Hold)
		.where(eq(Hold.id, holdId))
		.then((rows) => rows[0]?.commercialSnapshotJson as any)
}

async function seedFixture(params: {
	variantId: string
	productId: string
	ratePlanId: string
	dates: string[]
	includeAdultTwoRows?: boolean
}) {
	const geoPlaceId = `place_hold_${crypto.randomUUID()}`
	await upsertGeoPlace({
		id: geoPlaceId,
		name: "Hold test destination",
		type: "city",
		country: "CL",
		slug: `hold-effective-pricing-${geoPlaceId}`,
	})
	await upsertProduct({
		id: params.productId,
		name: "Hold test product",
		productType: "Hotel",
		geoPlaceId,
		providerId: "prov_test",
	})

	await db.insert(Variant).values({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Hold test room",
		status: "ready",
		createdAt: new Date(),
		isActive: true,
	} as any)
	await db.insert(RatePlan).values({
		id: params.ratePlanId,
		variantId: params.variantId,
		name: "Hold test rate",
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)

	const cancellation = await createPolicyCapa6({
		ownerProviderId: "prov_test",
		category: "Cancellation",
		description: "Flexible cancellation",
		cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
	} as any)
	const payment = await createPolicyCapa6({
		ownerProviderId: "prov_test",
		category: "Payment",
		description: "Pay at property",
		rules: { paymentType: "pay_at_property" },
	} as any)
	const checkIn = await createPolicyCapa6({
		ownerProviderId: "prov_test",
		category: "CheckIn",
		description: "Standard check-in",
		rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
	} as any)
	const noShow = await createPolicyCapa6({
		ownerProviderId: "prov_test",
		category: "NoShow",
		description: "No-show first night",
		rules: { penaltyType: "first_night" },
	} as any)
	for (const policy of [cancellation, payment, checkIn, noShow]) {
		await replacePolicyAssignmentCapa6({
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
		await db.insert(EffectivePricing).values({
			id: `ep_hold_${crypto.randomUUID()}`,
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
		if (params.includeAdultTwoRows && EffectivePricing && (EffectivePricing as any).variantId) {
			await db.insert(EffectivePricing).values({
				id: `ep_hold_${crypto.randomUUID()}`,
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
		idempotencyKey: `hold_effective_pricing:${variantId}:${from}:${to}`,
	})
	await materializeSearchUnitRange({
		variantId,
		ratePlanId,
		from,
		to,
		currency: "USD",
	})
}

describe("integration/hold effective-pricing snapshot", () => {
	const supportsEffectivePricing = Boolean(EffectivePricing && (EffectivePricing as any).variantId)

	;(supportsEffectivePricing ? it : it.skip)(
		"stores the effective-pricing breakdown and keeps Search total aligned with Hold and Booking totals",
		async () => {
			const token = "t_hold_effective_pricing_ok"
			const variantId = `var_hold_effective_pricing_ok_${crypto.randomUUID()}`
			const productId = `prod_hold_effective_pricing_ok_${crypto.randomUUID()}`
			const ratePlanId = `rp_hold_effective_pricing_ok_${crypto.randomUUID()}`
			const dates = ["2026-11-10", "2026-11-11"]
			await seedFixture({ variantId, productId, ratePlanId, dates, includeAdultTwoRows: true })
			await refreshSearchView(variantId, ratePlanId, "2026-11-10", "2026-11-12")

			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-11-10")
			fd.set("checkOut", "2026-11-12")
			fd.set("adults", "2")
			fd.set("children", "0")
			fd.set("infants", "0")
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
			expect(body?.warnings).toEqual([])

			const snapshot = await readHoldCommercialSnapshot(holdId)
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
				{ repo: createSearchOffersRepositoryForTests() }
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
					totalPrice: BookingLineItem.totalAmount,
					basePrice: BookingLineItem.subtotalAmount,
					pricingBreakdownJson: BookingLineItem.pricingBreakdownJson,
				})
				.from(BookingLineItem)
				.where(eq(BookingLineItem.bookingId, bookingId))
				.then((rows) => rows[0])
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

			const bookingRows = await db.select().from(Booking).where(eq(Booking.id, bookingId))
			expect(bookingRows).toHaveLength(1)
		}
	)

	it("requires explicit V2 coverage before hold pricing snapshot reads", async () => {
		const token = "t_hold_v2_fallback"
		const variantId = `var_hold_v2_fb_${crypto.randomUUID()}`
		const productId = `prod_hold_v2_fb_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_v2_fb_${crypto.randomUUID()}`
		const dates = ["2026-11-20", "2026-11-21"]
		await seedFixture({ variantId, productId, ratePlanId, dates, includeAdultTwoRows: false })
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
		fd.set("adults", "2")
		fd.set("children", "0")
		fd.set("infants", "0")
		fd.set("sessionId", `s_${crypto.randomUUID()}`)
		const response = await withSupabaseAuthStub(
			{ [token]: { id: "user_hold_v2_fb", email: "hold-effective-pricing-fallback@example.com" } },
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
		expect(body?.warnings).toEqual([])
		const snapshot = await readHoldCommercialSnapshot(holdId)
		expect(snapshot?.days?.every((day: any) => day?.pricingSource === "v2")).toBe(true)
		expect(snapshot?.totalPrice).toBeGreaterThan(0)
	})

	it("rejects booking confirmation when hold snapshot is incomplete", async () => {
		const token = "t_hold_incomplete_snapshot"
		const variantId = `var_hold_incomplete_${crypto.randomUUID()}`
		const productId = `prod_hold_incomplete_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_incomplete_${crypto.randomUUID()}`
		const dates = ["2026-12-01", "2026-12-02"]
		await seedFixture({ variantId, productId, ratePlanId, dates, includeAdultTwoRows: false })
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
		fd.set("adults", "2")
		fd.set("children", "0")
		fd.set("infants", "0")
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

		await db
			.update(Hold)
			.set({
				commercialSnapshotVersion: "legacy",
				priceQuoteId: null,
				commercialSnapshotJson: null,
			} as any)
			.where(eq(Hold.id, holdId))

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
		expect(confirmResponse.status).toBe(409)
		const confirmBody = await readJson(confirmResponse)
		expect(String((confirmBody as any)?.error ?? "")).toBe("HOLD_COMMERCIAL_SNAPSHOT_MISSING")
	})

	it("preserves real multi-occupancy detail in hold snapshot and booking materialization", async () => {
		const token = "t_hold_multi_occ"
		const variantId = `var_hold_multi_occ_${crypto.randomUUID()}`
		const productId = `prod_hold_multi_occ_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_multi_occ_${crypto.randomUUID()}`
		const dates = ["2026-12-10", "2026-12-11"]
		await seedFixture({ variantId, productId, ratePlanId, dates, includeAdultTwoRows: true })
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
		const snapshot = await readHoldCommercialSnapshot(holdId)
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
			.select({ pricingBreakdownJson: BookingLineItem.pricingBreakdownJson })
			.from(BookingLineItem)
			.where(eq(BookingLineItem.bookingId, bookingId))
			.then((rows) => rows[0])
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
