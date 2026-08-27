import { expect, it } from "vitest"
import { describePostgres as describe } from "../setup/postgres-suite"

import {
	Booking,
	BookingVoucher,
	db,
	DailyInventory,
	GeoPlace,
	ProductGeoPlace,
	EffectiveAvailability,
	EffectivePricingV2,
	eq,
	Product,
	Provider,
	ProviderUser,
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
import { POST as checkInPost } from "@/pages/api/booking/check-in"
import { GET as tripGet } from "@/pages/api/trips/[bookingId]"
import { tourDepartureToStay } from "@/lib/tours/tourSemantics"
import { deriveBookingLifecycle } from "@/modules/booking/public"
import { replacePolicyAssignmentCapa6, createPolicyCapa6 } from "@/modules/policies/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
import { markProductPublished } from "../test-support/catalog-db-test-data"

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
	body?: Record<string, unknown>
	method?: string
}): Request {
	const headers = new Headers()
	if (params.body) headers.set("Content-Type", "application/json")
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: params.method ?? (params.body ? "POST" : "GET"),
		body: params.body ? JSON.stringify(params.body) : undefined,
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

async function seedTourBookingReady(params: {
	suffix: string
	userId: string
	email: string
	providerUserId: string
}) {
	const productId = `prod_tour_day_${params.suffix}`
	const geoPlaceId = `dest_tour_day_${params.suffix}`
	const variantId = `var_tour_day_${params.suffix}`
	const ratePlanId = `rp_tour_day_${params.suffix}`
	const departure = "2026-10-20"
	const stay = tourDepartureToStay(departure)
	const checkIn = stay.checkIn.toISOString().slice(0, 10)
	const checkOut = stay.checkOut.toISOString().slice(0, 10)
	const occupancy = { adults: 2, children: 0, infants: 0 }
	const rooms = 2
	const meetingPoint = {
		address: "Mirador Killi Killi",
		instructions: "Llegar 15 minutos antes con el voucher.",
	}

	await db
		.insert(Provider)
		.values({ id: "prov_test", legalName: "Provider prov_test" })
		.onConflictDoNothing()
	await db
		.insert(User)
		.values({
			id: params.userId,
			email: params.email,
			firstName: "Guest",
			lastName: "Tour",
		} as any)
		.onConflictDoNothing()
	await db
		.insert(User)
		.values({
			id: params.providerUserId,
			email: `provider-${params.suffix}@example.com`,
			firstName: "Ops",
			lastName: "Host",
		} as any)
		.onConflictDoNothing()
	await db
		.insert(ProviderUser)
		.values({
			id: `pu_${params.suffix}`,
			providerId: "prov_test",
			userId: params.providerUserId,
			role: "owner",
		} as any)
		.onConflictDoNothing()

	await db.insert(GeoPlace).values({
		id: geoPlaceId,
		canonicalName: `DayOf Dest ${geoPlaceId}`,
		normalizedName: `dayof dest ${geoPlaceId}`.replace(/_/g, "-"),
		placeType: "city",
		countryCode: "BO",
		slug: geoPlaceId.replace(/_/g, "-"),
		canonicalPath: geoPlaceId.replace(/_/g, "-"),
	} as any)
	await db.insert(Product).values({
		id: productId,
		name: "Mirador Tour",
		productType: "Tour",
		providerId: "prov_test",
	} as any)
	await db.insert(ProductGeoPlace).values({
		id: `test-primary-${productId}`,
		productId,
		placeId: geoPlaceId,
		role: "primary_discovery",
		isPrimary: true,
		source: "test_fixture",
	} as any)
	await markProductPublished(productId)
	await db.insert(Tour).values({
		productId,
		duration: "2h",
		durationMinutes: 120,
		meetingPointJson: meetingPoint,
		itineraryJson: ["Mirador"],
	} as any)
	await db.insert(Variant).values({
		id: variantId,
		productId,
		kind: "tour_slot",
		name: "Salida 10:00",
		lifecycleState: "ready",
		salesEnabled: true,
		createdAt: new Date(),
	} as any)
	await db.insert(TourSlotProfile).values({
		variantId,
		departureTime: "10:00",
		maxPax: 8,
		languageCode: "es",
		bookingMode: "shared",
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)
	await db.insert(VariantCapacity).values({
		variantId,
		minOccupancy: 1,
		maxOccupancy: 8,
		maxAdults: 8,
	} as any)
	await db.insert(VariantInventoryConfig).values({
		variantId,
		defaultTotalUnits: 8,
		horizonDays: 365,
	} as any)
	await db.insert(RatePlan).values({
		id: ratePlanId,
		variantId,
		name: "Standard",
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)

	for (const policy of [
		await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Cancellation",
			description: "Flexible",
			cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 }],
		} as any),
		await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Payment",
			description: "Pay later",
			rules: { paymentType: "pay_at_property" },
		} as any),
		await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "CheckIn",
			description: "Day of",
			rules: { checkInFrom: "09:00", checkInUntil: "11:00", checkOutUntil: "18:00" },
		} as any),
		await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "NoShow",
			description: "No show",
			rules: { penaltyType: "percentage", penaltyAmount: 100 },
		} as any),
	]) {
		await replacePolicyAssignmentCapa6({
			policyId: policy.policyId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			channel: "web",
		})
	}

	await db.insert(DailyInventory).values({
		id: `di_${crypto.randomUUID()}`,
		variantId,
		date: checkIn,
		totalInventory: 8,
		reservedCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)
	const occupancyKey = buildOccupancyKey(occupancy)
	await db.insert(EffectivePricingV2).values({
		id: `ep_${crypto.randomUUID()}`,
		variantId,
		ratePlanId,
		date: checkIn,
		occupancyKey,
		baseComponent: 50,
		occupancyAdjustment: 0,
		ruleAdjustment: 0,
		finalBasePrice: 50,
		currency: "USD",
		computedAt: new Date(),
		sourceVersion: "test",
	} as any)
	await db.insert(EffectiveAvailability).values({
		id: `ea_${crypto.randomUUID()}`,
		variantId,
		date: checkIn,
		totalUnits: 8,
		heldUnits: 0,
		bookedUnits: 0,
		availableUnits: 8,
		computedAt: new Date(),
	} as any)
	await db.insert(SearchUnitView).values({
		id: `suv_${crypto.randomUUID()}`,
		variantId,
		productId,
		ratePlanId,
		date: checkIn,
		occupancyKey,
		totalGuests: occupancy.adults + occupancy.children,
		hasAvailability: true,
		hasPrice: true,
		isAvailable: true,
		availableUnits: 8,
		pricePerNight: 50,
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

	return { productId, variantId, ratePlanId, checkIn, checkOut, occupancy, rooms, meetingPoint }
}

async function seedHotelBookingForProvider(params: {
	suffix: string
	providerId: string
	guestUserId: string
}): Promise<{ bookingId: string }> {
	const bookingId = crypto.randomUUID()
	const productId = `prod_hotel_chk_${params.suffix}`
	const geoPlaceId = `dest_hotel_chk_${params.suffix}`
	const variantId = `var_hotel_chk_${params.suffix}`
	const ratePlanId = `rp_hotel_chk_${params.suffix}`

	await db
		.insert(GeoPlace)
		.values({
			id: geoPlaceId,
			canonicalName: `Hotel Dest ${geoPlaceId}`,
			normalizedName: `hotel dest ${geoPlaceId}`.replace(/_/g, "-"),
			placeType: "city",
			countryCode: "BO",
			slug: geoPlaceId.replace(/_/g, "-"),
			canonicalPath: geoPlaceId.replace(/_/g, "-"),
		} as any)
		.onConflictDoNothing()
	await db.insert(Product).values({
		id: productId,
		name: "Hotel Checkin Guard",
		productType: "Hotel",
		providerId: params.providerId,
	} as any)
	await db.insert(ProductGeoPlace).values({
		id: `test-primary-${productId}`,
		productId,
		placeId: geoPlaceId,
		role: "primary_discovery",
		isPrimary: true,
		source: "test_fixture",
	} as any)
	await db.insert(Variant).values({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: "Standard Room",
		lifecycleState: "ready",
		salesEnabled: true,
		createdAt: new Date(),
	} as any)
	await db.insert(RatePlan).values({
		id: ratePlanId,
		variantId,
		name: "BAR",
		isDefault: true,
		isActive: true,
		createdAt: new Date(),
	} as any)
	await db.insert(Booking).values({
		id: bookingId,
		providerId: params.providerId,
		userId: params.guestUserId,
		ratePlanId,
		checkInDate: "2026-11-01",
		checkOutDate: "2026-11-03",
		numAdults: 2,
		numChildren: 0,
		totalAmount: 200,
		status: "confirmed",
		operationalStatus: "pending_arrival",
		currency: "USD",
		source: "web",
		confirmedAt: new Date(),
	} as any)

	return { bookingId }
}

describe("integration/tour check-in + guest trip (P0 1.3–1.4 / P1 auth matrix)", () => {
	it(
		"authorizes trip/check-in matrix and refuses non-Tour mutation",
		async () => {
			process.env.INVENTORY_MUTATION_TIMEOUT_MS = "60000"
			process.env.INVENTORY_RECOMPUTE_CHAIN_TIMEOUT_MS = "60000"
			process.env.TOURS_CHECKOUT_ENABLED = "true"
			process.env.TOURS_CHECKIN_ENABLED = "true"
			process.env.TOURS_PUBLIC_SEARCH_ENABLED = "true"
			process.env.FASTT_CACHE_L1_TTL_SECONDS = "900"
			process.env.LOCAL_QA_AUTH_ENABLED = "false"
			const suffix = crypto.randomUUID().slice(0, 8)
			const guestToken = `t_guest_${suffix}`
			const otherToken = `t_other_${suffix}`
			const providerToken = `t_provider_${suffix}`
			const foreignProviderToken = `t_foreign_${suffix}`
			const guestId = `u_guest_${suffix}`
			const otherId = `u_other_${suffix}`
			const providerUserId = `u_provider_${suffix}`
			const foreignProviderUserId = `u_foreign_${suffix}`
			const foreignProviderId = `prov_foreign_${suffix}`

			await db
				.insert(User)
				.values({ id: otherId, email: `other-${suffix}@example.com` } as any)
				.onConflictDoNothing()
			await db
				.insert(Provider)
				.values({ id: foreignProviderId, legalName: `Foreign ${suffix}` } as any)
				.onConflictDoNothing()
			await db
				.insert(User)
				.values({
					id: foreignProviderUserId,
					email: `foreign-${suffix}@example.com`,
					firstName: "Foreign",
					lastName: "Ops",
				} as any)
				.onConflictDoNothing()
			await db
				.insert(ProviderUser)
				.values({
					id: `pu_foreign_${suffix}`,
					providerId: foreignProviderId,
					userId: foreignProviderUserId,
					role: "owner",
				} as any)
				.onConflictDoNothing()

			const seeded = await seedTourBookingReady({
				suffix,
				userId: guestId,
				email: `guest-${suffix}@example.com`,
				providerUserId,
			})
			const hotel = await seedHotelBookingForProvider({
				suffix,
				providerId: "prov_test",
				guestUserId: guestId,
			})

			const bookingId = await withSupabaseAuthStub(
				{
					[guestToken]: { id: guestId, email: `guest-${suffix}@example.com` },
					[otherToken]: { id: otherId, email: `other-${suffix}@example.com` },
					[providerToken]: {
						id: providerUserId,
						email: `provider-${suffix}@example.com`,
					},
					[foreignProviderToken]: {
						id: foreignProviderUserId,
						email: `foreign-${suffix}@example.com`,
					},
				},
				async () => {
					const holdRes = await holdPost({
						request: makeAuthedJsonRequest({
							path: "/api/inventory/hold",
							token: guestToken,
							body: {
								variantId: seeded.variantId,
								ratePlanId: seeded.ratePlanId,
								dateRange: { from: seeded.checkIn, to: seeded.checkOut },
								rooms: seeded.rooms,
								occupancyDetail: seeded.occupancy,
							},
						}),
					} as any)
					const holdPayload = (await readJson(holdRes)) as any
					if (holdRes.status !== 200) {
						throw new Error(`hold failed: ${JSON.stringify(holdPayload)}`)
					}
					expect(holdRes.status).toBe(200)
					const holdId = String(holdPayload?.holdId ?? "")
					expect(holdId).toBeTruthy()

					const confirmRes = await bookingConfirmPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/confirm",
							token: guestToken,
							body: { holdId },
						}),
					} as any)
					expect(confirmRes.status).toBe(200)
					const id = String(((await readJson(confirmRes)) as any)?.bookingId ?? "")
					expect(id).toBeTruthy()

					// Guest cannot check in (provider-only).
					const guestCheckIn = await checkInPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/check-in",
							token: guestToken,
							body: { bookingId: id },
						}),
					} as any)
					expect(guestCheckIn.status).toBe(401)

					// Foreign provider cannot operate another provider's booking.
					const foreignCheckIn = await checkInPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/check-in",
							token: foreignProviderToken,
							body: { bookingId: id },
						}),
					} as any)
					expect(foreignCheckIn.status).toBe(404)

					// Hotel booking owned by same provider must not be mutated.
					const hotelCheckIn = await checkInPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/check-in",
							token: providerToken,
							body: { bookingId: hotel.bookingId },
						}),
					} as any)
					expect(hotelCheckIn.status).toBe(404)
					const hotelBefore = await db
						.select({
							checkedInAt: Booking.checkedInAt,
							operationalStatus: Booking.operationalStatus,
						})
						.from(Booking)
						.where(eq(Booking.id, hotel.bookingId))
						.then((rows) => rows[0])
					expect(hotelBefore?.checkedInAt).toBeNull()
					expect(String(hotelBefore?.operationalStatus)).toBe("pending_arrival")

					const firstCheckIn = await checkInPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/check-in",
							token: providerToken,
							body: { bookingId: id },
						}),
					} as any)
					expect(firstCheckIn.status).toBe(200)
					const firstBody = (await readJson(firstCheckIn)) as any
					expect(firstBody.operationalStatus).toBe("checked_in")
					expect(firstBody.lifecycleState).toBe("in_house")
					expect(firstBody.voucherStatus).toBe("redeemed")
					expect(firstBody.idempotent).toBe(false)
					const firstTs = String(firstBody.checkedInAt)

					const secondCheckIn = await checkInPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/check-in",
							token: providerToken,
							body: { bookingId: id },
						}),
					} as any)
					expect(secondCheckIn.status).toBe(200)
					const secondBody = (await readJson(secondCheckIn)) as any
					expect(secondBody.idempotent).toBe(true)
					expect(secondBody.repaired).toBe(false)
					expect(String(secondBody.checkedInAt)).toBe(firstTs)
					expect(secondBody.voucherStatus).toBe("redeemed")

					// Simulate partial failure: booking already presented, voucher stuck issued.
					await db
						.update(BookingVoucher)
						.set({ status: "issued", redeemedAt: null, updatedAt: new Date() } as any)
						.where(eq(BookingVoucher.bookingId, id))
					const repairCheckIn = await checkInPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/check-in",
							token: providerToken,
							body: { bookingId: id },
						}),
					} as any)
					expect(repairCheckIn.status).toBe(200)
					const repairBody = (await readJson(repairCheckIn)) as any
					expect(repairBody.repaired).toBe(true)
					expect(repairBody.idempotent).toBe(false)
					expect(repairBody.voucherStatus).toBe("redeemed")
					expect(String(repairBody.checkedInAt)).toBe(firstTs)

					// Owner guest sees Trip; another guest gets 404.
					const guestTrip = await tripGet({
						request: makeAuthedJsonRequest({
							path: `/api/trips/${id}`,
							token: guestToken,
							method: "GET",
						}),
						params: { bookingId: id },
					} as any)
					expect(guestTrip.status).toBe(200)
					const tripBody = (await readJson(guestTrip)) as any
					expect(tripBody.departureTime).toBe("10:00")
					expect(tripBody.meetingPoint).toMatchObject(seeded.meetingPoint)
					expect(tripBody.voucher?.status).toBe("redeemed")
					expect(tripBody.participants).toMatchObject({ adults: 2, children: 0 })

					const otherTrip = await tripGet({
						request: makeAuthedJsonRequest({
							path: `/api/trips/${id}`,
							token: otherToken,
							method: "GET",
						}),
						params: { bookingId: id },
					} as any)
					expect(otherTrip.status).toBe(404)

					const hotelAfter = await db
						.select({
							checkedInAt: Booking.checkedInAt,
							operationalStatus: Booking.operationalStatus,
						})
						.from(Booking)
						.where(eq(Booking.id, hotel.bookingId))
						.then((rows) => rows[0])
					expect(hotelAfter?.checkedInAt).toBeNull()
					expect(String(hotelAfter?.operationalStatus)).toBe("pending_arrival")

					return id
				}
			)

			const booking = await db
				.select()
				.from(Booking)
				.where(eq(Booking.id, bookingId))
				.then((rows) => rows[0])
			expect(String(booking?.operationalStatus)).toBe("checked_in")
			expect(String(booking?.checkedInBy)).toBe(providerUserId)
			expect(booking?.checkedInAt).toBeTruthy()

			const lifecycle = deriveBookingLifecycle({
				status: String(booking?.status),
				operationalStatus: String(booking?.operationalStatus),
				checkIn: String(booking?.checkInDate),
				checkOut: String(booking?.checkOutDate),
				productType: "Tour",
			})
			expect(lifecycle.state).toBe("in_house")

			const voucher = await db
				.select()
				.from(BookingVoucher)
				.where(eq(BookingVoucher.bookingId, bookingId))
				.then((rows) => rows[0])
			expect(String(voucher?.status)).toBe("redeemed")
			expect(voucher?.redeemedAt).toBeTruthy()
		},
		180_000
	)
})
