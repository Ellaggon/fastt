import { expect, it } from "vitest"
import { describePostgres as describe } from "../setup/postgres-suite"

import {
	and,
	Booking,
	BookingLineItem,
	BookingVoucher,
	db,
	DailyInventory,
	ProductGeoPlace,
	EffectiveAvailability,
	EffectivePricing,
	eq,
	Product,
	Provider,
	RatePlan,
	SearchUnitView,
	Tour,
	TourSlotProfile,
	User,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
} from "@/shared/infrastructure/db/compat"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { searchOffers } from "@/container"
import { tourDepartureToStay } from "@/lib/tours/tourSemantics"
import { replacePolicyAssignmentCapa6, createPolicyCapa6 } from "@/modules/policies/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import { markProductPublished } from "../test-support/catalog-db-test-data"
import { upsertGeoPlace } from "@/shared/infrastructure/test-support/db-test-data"

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

function makeAuthedJsonRequest(params: {
	path: string
	token?: string
	body: Record<string, unknown>
}): Request {
	const headers = new Headers({ "Content-Type": "application/json" })
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: JSON.stringify(params.body),
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

async function seedTourCommercialReady(params: {
	productId: string
	geoPlaceId: string
	variantId: string
	ratePlanId: string
	departureTime: string
	maxPax: number
	departureDate: string
	meetingPoint: Record<string, unknown>
	occupancy: { adults: number; children: number; infants: number }
	unitPrice?: number
}) {
	const unitPrice = params.unitPrice ?? 80
	const occupancyKey = buildOccupancyKey(params.occupancy)

	await db
		.insert(Provider)
		.values({ id: "prov_test", legalName: "Provider prov_test" })
		.onConflictDoNothing()

	await upsertGeoPlace({
		id: params.geoPlaceId,
		canonicalName: `Tour Dest ${params.geoPlaceId}`,
		placeType: "city",
		countryCode: "BO",
		slug: params.geoPlaceId,
	})

	await db
		.insert(Product)
		.values({
			id: params.productId,
			name: "City Tour",
			productType: "Tour",
			providerId: "prov_test",
		} as any)
		.onConflictDoNothing()
	await db
		.insert(ProductGeoPlace)
		.values({
			id: `test-primary-${params.productId}`,
			productId: params.productId,
			placeId: params.geoPlaceId,
			role: "primary_discovery",
			isPrimary: true,
			source: "test_fixture",
		} as any)
		.onConflictDoNothing()
	await markProductPublished(params.productId)

	await db
		.insert(Tour)
		.values({
			productId: params.productId,
			duration: "3h",
			durationMinutes: 180,
			difficultyLevel: "easy",
			meetingPointJson: params.meetingPoint,
			itineraryJson: ["Centro histórico"],
		} as any)
		.onConflictDoNothing()

	await db.insert(Variant).values({
		id: params.variantId,
		productId: params.productId,
		kind: "tour_slot",
		name: `Salida ${params.departureTime}`,
		lifecycleState: "ready",
		salesEnabled: true,
		createdAt: new Date(),
	} as any)

	await db.insert(TourSlotProfile).values({
		variantId: params.variantId,
		departureTime: params.departureTime,
		maxPax: params.maxPax,
		languageCode: "es",
		bookingMode: "shared",
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)

	await db.insert(VariantCapacity).values({
		variantId: params.variantId,
		minOccupancy: 1,
		maxOccupancy: params.maxPax,
		maxAdults: params.maxPax,
	} as any)

	await db.insert(VariantInventoryConfig).values({
		variantId: params.variantId,
		defaultTotalUnits: params.maxPax,
		horizonDays: 365,
	} as any)

	await db.insert(RatePlan).values({
		id: params.ratePlanId,
		variantId: params.variantId,
		name: "Standard",
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)

	const cancellation = await createPolicyCapa6({
		ownerProviderId: "prov_test",
		category: "Cancellation",
		description: "Flexible tour cancellation",
		cancellationTiers: [
			{
				daysBeforeArrival: 1,
				hoursBeforeDeparture: 6,
				penaltyType: "percentage",
				penaltyAmount: 0,
			},
			{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
		],
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
		description: "Tour day-of",
		rules: { checkInFrom: "08:00", checkInUntil: "18:00", checkOutUntil: "20:00" },
	} as any)
	const noShow = await createPolicyCapa6({
		ownerProviderId: "prov_test",
		category: "NoShow",
		description: "No-show full",
		rules: { penaltyType: "percentage", penaltyAmount: 100 },
	} as any)
	for (const policy of [cancellation, payment, checkIn, noShow]) {
		await replacePolicyAssignmentCapa6({
			policyId: policy.policyId,
			scope: "rate_plan",
			scopeId: params.ratePlanId,
			channel: "web",
		})
	}

	await db.insert(DailyInventory).values({
		id: `di_${crypto.randomUUID()}`,
		variantId: params.variantId,
		date: params.departureDate,
		totalInventory: params.maxPax,
		reservedCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)

	await db.insert(EffectivePricing).values({
		id: `ep_${crypto.randomUUID()}`,
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		date: params.departureDate,
		occupancyKey,
		baseComponent: unitPrice,
		occupancyAdjustment: 0,
		ruleAdjustment: 0,
		finalBasePrice: unitPrice,
		currency: "USD",
		computedAt: new Date(),
		sourceVersion: "test",
	} as any)

	await db.insert(EffectiveAvailability).values({
		id: `ea_${crypto.randomUUID()}`,
		variantId: params.variantId,
		date: params.departureDate,
		totalUnits: params.maxPax,
		heldUnits: 0,
		bookedUnits: 0,
		availableUnits: params.maxPax,
		computedAt: new Date(),
	} as any)

	const totalGuests =
		params.occupancy.adults + params.occupancy.children + params.occupancy.infants
	await db.insert(SearchUnitView).values({
		id: `suv_${crypto.randomUUID()}`,
		variantId: params.variantId,
		productId: params.productId,
		ratePlanId: params.ratePlanId,
		date: params.departureDate,
		occupancyKey,
		totalGuests,
		hasAvailability: true,
		hasPrice: true,
		isAvailable: true,
		availableUnits: params.maxPax,
		pricePerNight: unitPrice,
		currency: "USD",
		primaryBlocker: null,
		minStay: 1,
		maxStay: null,
		minLeadTime: null,
		maxLeadTime: null,
		cta: false,
		ctd: false,
		computedAt: new Date(),
		sourceVersion: "test",
	} as any)
}

describe("integration/tour booking E2E (P0 1.1)", () => {
	it(
		"runs real search → hold → confirm with independent cupo per salida",
		async () => {
			process.env.INVENTORY_MUTATION_TIMEOUT_MS = "60000"
			process.env.INVENTORY_RECOMPUTE_CHAIN_TIMEOUT_MS = "60000"
			// Hold pricing lives in L1 when Redis is unavailable; keep it past slow recompute.
			process.env.FASTT_CACHE_L1_TTL_SECONDS = "900"
			process.env.LOCAL_QA_AUTH_ENABLED = "false"
			process.env.TOURS_CHECKOUT_ENABLED = "true"
			process.env.TOURS_REFUND_HOURS_ENABLED = "true"
			process.env.TOURS_CHECKIN_ENABLED = "true"
			process.env.TOURS_PUBLIC_SEARCH_ENABLED = "true"
			const suffix = crypto.randomUUID()
			const token = `t_tour_e2e_${suffix}`
			const userId = `u_tour_e2e_${suffix}`
			const email = `tour-e2e-${suffix}@example.com`
			const productId = `prod_tour_${suffix}`
			const geoPlaceId = `dest_tour_${suffix}`
			const morningId = `var_tour_am_${suffix}`
			const afternoonId = `var_tour_pm_${suffix}`
			const morningRp = `rp_tour_am_${suffix}`
			const afternoonRp = `rp_tour_pm_${suffix}`
			const departure = "2026-09-15"
			const stay = tourDepartureToStay(departure)
			const checkIn = stay.checkIn.toISOString().slice(0, 10)
			const checkOut = stay.checkOut.toISOString().slice(0, 10)
			expect(stay.nights).toBe(1)

			const maxPax = 10
			const adults = 2
			const children = 1
			const infants = 0
			const rooms = adults + children
			const occupancy = { adults, children, infants }
			const meetingPoint = {
				address: "Plaza Murillo",
				instructions: "Esperar junto a la catedral con chaleco naranja.",
			}

			await db
				.insert(User)
				.values({
					id: userId,
					email,
					firstName: "Ana",
					lastName: "Tour",
				} as any)
				.onConflictDoNothing()

			await seedTourCommercialReady({
				productId,
				geoPlaceId,
				variantId: morningId,
				ratePlanId: morningRp,
				departureTime: "09:00",
				maxPax,
				departureDate: checkIn,
				meetingPoint,
				occupancy,
			})
			await seedTourCommercialReady({
				productId,
				geoPlaceId,
				variantId: afternoonId,
				ratePlanId: afternoonRp,
				departureTime: "15:30",
				maxPax,
				departureDate: checkIn,
				meetingPoint,
				occupancy,
			})

			const offers = await searchOffers({
				productId,
				checkIn: stay.checkIn,
				checkOut: stay.checkOut,
				adults,
				children,
				rooms,
				currency: "USD",
			})
			const offerVariantIds = offers.map((offer) => String(offer.variantId)).sort()
			expect(offerVariantIds).toEqual([afternoonId, morningId].sort())
			expect(
				offers.every((offer) =>
					(Array.isArray(offer.ratePlans) ? offer.ratePlans : []).some(
						(plan: any) => Number(plan?.finalPrice ?? plan?.basePrice ?? 0) > 0
					)
				)
			).toBe(true)

			await withSupabaseAuthStub({ [token]: { id: userId, email } }, async () => {
				const holdRes = await holdPost({
					request: makeAuthedJsonRequest({
						path: "/api/inventory/hold",
						token,
						body: {
							variantId: morningId,
							ratePlanId: morningRp,
							dateRange: { from: checkIn, to: checkOut },
							rooms,
							occupancyDetail: occupancy,
						},
					}),
				} as any)
				const holdBody = (await readJson(holdRes)) as any
				if (holdRes.status !== 200) {
					throw new Error(`hold failed: ${JSON.stringify(holdBody)}`)
				}
				const holdId = String(holdBody?.holdId ?? "")
				expect(holdId.length).toBeGreaterThan(0)

				const confirmRes = await bookingConfirmPost({
					request: makeAuthedJsonRequest({
						path: "/api/booking/confirm",
						token,
						body: { holdId },
					}),
				} as any)
				const confirmBody = (await readJson(confirmRes)) as any
				if (confirmRes.status !== 200) {
					throw new Error(`confirm failed: ${JSON.stringify(confirmBody)}`)
				}
				const bookingId = String(confirmBody?.bookingId ?? "")
				expect(bookingId.length).toBeGreaterThan(0)

				const morningInv = await db
					.select({
						reservedCount: DailyInventory.reservedCount,
						totalInventory: DailyInventory.totalInventory,
					})
					.from(DailyInventory)
					.where(and(eq(DailyInventory.variantId, morningId), eq(DailyInventory.date, checkIn)))
					.then((rows) => rows[0])
				expect(Number(morningInv?.reservedCount)).toBe(rooms)
				expect(Number(morningInv?.totalInventory)).toBe(maxPax)

				const afternoonInv = await db
					.select({
						reservedCount: DailyInventory.reservedCount,
						totalInventory: DailyInventory.totalInventory,
					})
					.from(DailyInventory)
					.where(and(eq(DailyInventory.variantId, afternoonId), eq(DailyInventory.date, checkIn)))
					.then((rows) => rows[0])
				expect(Number(afternoonInv?.reservedCount)).toBe(0)
				expect(Number(afternoonInv?.totalInventory)).toBe(maxPax)

				const booking = await db
					.select()
					.from(Booking)
					.where(eq(Booking.id, bookingId))
					.then((rows) => rows[0])
				expect(booking).toBeTruthy()
				expect(String(booking?.status)).toBe("confirmed")
				expect(String(booking?.userId)).toBe(userId)
				expect(Number(booking?.numAdults)).toBe(adults)
				expect(Number(booking?.numChildren)).toBe(children)

				const contact = (booking?.guestContactSnapshotJson ?? {}) as Record<string, unknown>
				expect(contact.meetingPoint).toMatchObject(meetingPoint)
				expect(String(contact.departureTime ?? "")).toBe("09:00")

				const lineItems = await db
					.select()
					.from(BookingLineItem)
					.where(eq(BookingLineItem.bookingId, bookingId))
				expect(lineItems).toHaveLength(1)
				expect(String(lineItems[0]?.variantId)).toBe(morningId)
				expect(Number(lineItems[0]?.adults)).toBe(adults)
				expect(Number(lineItems[0]?.children)).toBe(children)

				const voucher = await db
					.select()
					.from(BookingVoucher)
					.where(eq(BookingVoucher.bookingId, bookingId))
					.then((rows) => rows[0])
				expect(voucher).toBeTruthy()
				expect(String(voucher?.status)).toBe("issued")
				expect(String(voucher?.code ?? "")).toMatch(/^FT-/)
				expect(voucher?.instructionsJson).toMatchObject({
					departureDate: checkIn,
					departureTime: "09:00",
					participants: occupancy,
				})
			})
		},
		120_000
	)
})
