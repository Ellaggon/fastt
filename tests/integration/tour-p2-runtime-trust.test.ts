import { expect, it } from "vitest"
import { describePostgres as describe } from "../setup/postgres-suite"

import {
	Booking,
	BookingLineItem,
	BookingVoucher,
	DailyInventory,
	db,
	GeoPlace,
	ProductGeoPlace,
	EffectiveAvailability,
	EffectivePricingV2,
	eq,
	MarketplaceEvent,
	Product,
	ProductReview,
	Provider,
	ProviderUser,
	RatePlan,
	SearchUnitView,
	Tour,
	TourPrivateRequest,
	TourSlotProfile,
	User,
	Variant,
	VariantCapacity,
	VariantInventoryConfig,
} from "@/shared/infrastructure/db/compat"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { POST as bookingCancelPost } from "@/pages/api/booking/cancel"
import { POST as privateRequestPost } from "@/pages/api/tours/private-request"
import { POST as privateTransitionPost } from "@/pages/api/tours/private-request/transition"
import { POST as reviewCreatePost } from "@/pages/api/reviews/create"
import { POST as reviewModeratePost } from "@/pages/api/reviews/moderate"
import { POST as marketplacePost } from "@/pages/api/telemetry/marketplace"
import { loadHotelTourCrossSell } from "@/lib/tours/hotelTourCrossSell"
import { tourDepartureToStay } from "@/lib/tours/tourSemantics"
import { createPolicyCapa6, replacePolicyAssignmentCapa6 } from "@/modules/policies/public"
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
		const token =
			typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
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

async function seedPrivateVariant(suffix: string) {
	const productId = `prod_priv_${suffix}`
	const geoPlaceId = `dest_priv_${suffix}`
	const variantId = `var_priv_${suffix}`
	await db.insert(Provider).values({ id: "prov_test", legalName: "Provider prov_test" }).onConflictDoNothing()
	await db.insert(GeoPlace).values({
		id: geoPlaceId,
		canonicalName: `Private Dest ${geoPlaceId}`,
		normalizedName: `private dest ${geoPlaceId}`.replace(/_/g, "-"),
		placeType: "city",
		countryCode: "BO",
		slug: geoPlaceId.replace(/_/g, "-"),
		canonicalPath: geoPlaceId.replace(/_/g, "-"),
	} as any)
	await db.insert(Product).values({
		id: productId,
		name: "Private Tour",
		productType: "Tour",
		providerId: "prov_test",
		dataClass: "production",
	} as any)
	await db.insert(ProductGeoPlace).values({ id: `test-primary-${productId}`, productId, placeId: geoPlaceId, role: "primary_discovery", isPrimary: true, source: "test_fixture" } as any)
	// The public request endpoint only resolves published marketplace inventory.
	await db
		.update(Product)
		.set({ publicationState: "published", publicationUpdatedAt: new Date() })
		.where(eq(Product.id, productId))
	await db.insert(Variant).values({
		id: variantId,
		productId,
		kind: "tour_slot",
		name: "Privada",
		status: "ready",
		isActive: true,
		createdAt: new Date(),
	} as any)
	await db.insert(TourSlotProfile).values({
		variantId,
		departureTime: "11:00",
		maxPax: 6,
		languageCode: "es",
		bookingMode: "private",
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any)
	return { productId, variantId }
}

describe("integration/tour P2 runtime trust (review, private, cross-sell, cancel→void)", () => {
	it(
		"closes private-request accept transition with auth + idempotency",
		async () => {
			process.env.LOCAL_QA_AUTH_ENABLED = "false"
			const suffix = crypto.randomUUID().slice(0, 8)
			const providerToken = `t_prov_${suffix}`
			const foreignToken = `t_foreign_${suffix}`
			const providerUserId = `u_prov_${suffix}`
			const foreignUserId = `u_foreign_${suffix}`
			const foreignProviderId = `prov_foreign_${suffix}`
			const seeded = await seedPrivateVariant(suffix)

			await db.insert(User).values({
				id: providerUserId,
				email: `prov-${suffix}@example.com`,
			} as any)
			await db.insert(ProviderUser).values({
				id: `pu_${suffix}`,
				providerId: "prov_test",
				userId: providerUserId,
				role: "owner",
			} as any)
			await db.insert(Provider).values({ id: foreignProviderId, legalName: "Foreign" } as any)
			await db.insert(User).values({
				id: foreignUserId,
				email: `foreign-${suffix}@example.com`,
			} as any)
			await db.insert(ProviderUser).values({
				id: `pu_f_${suffix}`,
				providerId: foreignProviderId,
				userId: foreignUserId,
				role: "owner",
			} as any)

			const contactEmail = `guest-priv-${suffix}@example.com`

			await withSupabaseAuthStub(
				{
					[providerToken]: { id: providerUserId, email: `prov-${suffix}@example.com` },
					[foreignToken]: { id: foreignUserId, email: `foreign-${suffix}@example.com` },
				},
				async () => {
					const createRes = await privateRequestPost({
						request: makeAuthedJsonRequest({
							path: "/api/tours/private-request",
							body: {
								productId: seeded.productId,
								variantId: seeded.variantId,
								departureDate: "2026-11-15",
								party: { adults: 2, children: 0, infants: 0 },
								contactName: "Ada",
								contactEmail,
								message: "Grupo privado",
							},
						}),
					} as any)
					expect(createRes.status).toBe(200)
					const created = (await readJson(createRes)) as any
					expect(created.requestId).toBeTruthy()

					const again = await privateRequestPost({
						request: makeAuthedJsonRequest({
							path: "/api/tours/private-request",
							body: {
								productId: seeded.productId,
								variantId: seeded.variantId,
								departureDate: "2026-11-15",
								party: { adults: 2, children: 0, infants: 0 },
								contactName: "Ada",
								contactEmail,
							},
						}),
					} as any)
					expect(again.status).toBe(200)
					const againBody = (await readJson(again)) as any
					expect(againBody.requestId).toBe(created.requestId)

					const foreign = await privateTransitionPost({
						request: makeAuthedJsonRequest({
							path: "/api/tours/private-request/transition",
							token: foreignToken,
							body: { requestId: created.requestId, status: "accepted" },
						}),
					} as any)
					expect(foreign.status).toBe(404)

					const unauth = await privateTransitionPost({
						request: makeAuthedJsonRequest({
							path: "/api/tours/private-request/transition",
							body: { requestId: created.requestId, status: "accepted" },
						}),
					} as any)
					expect(unauth.status).toBe(401)

					const accept = await privateTransitionPost({
						request: makeAuthedJsonRequest({
							path: "/api/tours/private-request/transition",
							token: providerToken,
							body: {
								requestId: created.requestId,
								status: "accepted",
								providerNote: "OK",
							},
						}),
					} as any)
					expect(accept.status).toBe(200)
					const acceptBody = (await readJson(accept)) as any
					expect(acceptBody.status).toBe("accepted")
					expect(acceptBody.idempotent).toBe(false)

					const acceptAgain = await privateTransitionPost({
						request: makeAuthedJsonRequest({
							path: "/api/tours/private-request/transition",
							token: providerToken,
							body: { requestId: created.requestId, status: "accepted" },
						}),
					} as any)
					expect(acceptAgain.status).toBe(200)
					expect(((await readJson(acceptAgain)) as any).idempotent).toBe(true)

					const persisted = await db
						.select()
						.from(TourPrivateRequest)
						.where(eq(TourPrivateRequest.id, created.requestId))
						.then((rows) => rows[0])
					expect(String(persisted?.status)).toBe("accepted")
					expect(String(persisted?.providerNote)).toBe("OK")
				}
			)
		},
		60_000
	)

	it(
		"closes verified review → published moderation with auth + idempotency",
		async () => {
			process.env.LOCAL_QA_AUTH_ENABLED = "false"
			process.env.TOURS_CHECKIN_ENABLED = "true"
			const suffix = crypto.randomUUID().slice(0, 8)
			const guestToken = `t_guest_${suffix}`
			const otherToken = `t_other_${suffix}`
			const providerToken = `t_prov_${suffix}`
			const guestId = `u_guest_${suffix}`
			const otherId = `u_other_${suffix}`
			const providerUserId = `u_prov_${suffix}`
			const bookingId = crypto.randomUUID()
			const productId = `prod_rev_${suffix}`
			const geoPlaceId = `dest_rev_${suffix}`
			const variantId = `var_rev_${suffix}`
			const ratePlanId = `rp_rev_${suffix}`

			await db.insert(Provider).values({ id: "prov_test", legalName: "P" }).onConflictDoNothing()
			await db.insert(User).values({ id: guestId, email: `g-${suffix}@ex.com` } as any)
			await db.insert(User).values({ id: otherId, email: `o-${suffix}@ex.com` } as any)
			await db.insert(User).values({
				id: providerUserId,
				email: `p-${suffix}@ex.com`,
			} as any)
			await db.insert(ProviderUser).values({
				id: `pu_rev_${suffix}`,
				providerId: "prov_test",
				userId: providerUserId,
				role: "owner",
			} as any)
			await db.insert(GeoPlace).values({
				id: geoPlaceId,
				canonicalName: `Rev Dest ${geoPlaceId}`,
				normalizedName: `rev dest ${geoPlaceId}`.replace(/_/g, "-"),
				placeType: "city",
				countryCode: "BO",
				slug: geoPlaceId.replace(/_/g, "-"),
				canonicalPath: geoPlaceId.replace(/_/g, "-"),
			} as any)
			await db.insert(Product).values({
				id: productId,
				name: "Review Tour",
				productType: "Tour",
				providerId: "prov_test",
			} as any)
			await db.insert(ProductGeoPlace).values({ id: `test-primary-${productId}`, productId, placeId: geoPlaceId, role: "primary_discovery", isPrimary: true, source: "test_fixture" } as any)
			await db.insert(Variant).values({
				id: variantId,
				productId,
				kind: "tour_slot",
				name: "AM",
				status: "ready",
				isActive: true,
				createdAt: new Date(),
			} as any)
			await db.insert(RatePlan).values({
				id: ratePlanId,
				variantId,
				name: "Std",
				isDefault: true,
				isActive: true,
				createdAt: new Date(),
			} as any)
			await db.insert(Booking).values({
				id: bookingId,
				providerId: "prov_test",
				userId: guestId,
				ratePlanId,
				checkInDate: "2026-10-01",
				checkOutDate: "2026-10-02",
				numAdults: 1,
				status: "confirmed",
				operationalStatus: "checked_in",
				checkedInAt: new Date(),
				currency: "USD",
				totalAmount: 50,
				source: "web",
				confirmedAt: new Date(),
			} as any)
			await db.insert(BookingLineItem).values({
				id: crypto.randomUUID(),
				bookingId,
				variantId,
				ratePlanId,
				checkIn: "2026-10-01",
				checkOut: "2026-10-02",
				productIdSnapshot: productId,
				variantNameSnapshot: "AM",
				productNameSnapshot: "Review Tour",
				adults: 1,
				children: 0,
				subtotalAmount: 50,
				taxAmount: 0,
				totalAmount: 50,
			} as any)
			await db.insert(BookingVoucher).values({
				id: crypto.randomUUID(),
				bookingId,
				code: `V-${suffix}`,
				status: "redeemed",
				redeemedAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any)

			await withSupabaseAuthStub(
				{
					[guestToken]: { id: guestId, email: `g-${suffix}@ex.com` },
					[otherToken]: { id: otherId, email: `o-${suffix}@ex.com` },
					[providerToken]: { id: providerUserId, email: `p-${suffix}@ex.com` },
				},
				async () => {
					const unauth = await reviewCreatePost({
						request: makeAuthedJsonRequest({
							path: "/api/reviews/create",
							body: { bookingId, rating: 5 },
						}),
					} as any)
					expect(unauth.status).toBe(401)

					const other = await reviewCreatePost({
						request: makeAuthedJsonRequest({
							path: "/api/reviews/create",
							token: otherToken,
							body: { bookingId, rating: 5 },
						}),
					} as any)
					expect(other.status).toBe(404)

					const created = await reviewCreatePost({
						request: makeAuthedJsonRequest({
							path: "/api/reviews/create",
							token: guestToken,
							body: { bookingId, rating: 5, body: "Excelente" },
						}),
					} as any)
					expect(created.status).toBe(200)
					const createdBody = (await readJson(created)) as any
					expect(createdBody.reviewId).toBeTruthy()
					expect(createdBody.status).toBe("pending")
					expect(createdBody.idempotent).toBe(false)

					const again = await reviewCreatePost({
						request: makeAuthedJsonRequest({
							path: "/api/reviews/create",
							token: guestToken,
							body: { bookingId, rating: 4 },
						}),
					} as any)
					expect(again.status).toBe(200)
					const againBody = (await readJson(again)) as any
					expect(againBody.idempotent).toBe(true)
					expect(againBody.reviewId).toBe(createdBody.reviewId)

					const foreignModerate = await reviewModeratePost({
						request: makeAuthedJsonRequest({
							path: "/api/reviews/moderate",
							token: otherToken,
							body: { reviewId: createdBody.reviewId, status: "published" },
						}),
					} as any)
					expect(foreignModerate.status).toBe(401)

					const published = await reviewModeratePost({
						request: makeAuthedJsonRequest({
							path: "/api/reviews/moderate",
							token: providerToken,
							body: { reviewId: createdBody.reviewId, status: "published" },
						}),
					} as any)
					expect(published.status).toBe(200)
					expect(((await readJson(published)) as any).status).toBe("published")

					const publishedAgain = await reviewModeratePost({
						request: makeAuthedJsonRequest({
							path: "/api/reviews/moderate",
							token: providerToken,
							body: { reviewId: createdBody.reviewId, status: "published" },
						}),
					} as any)
					expect(((await readJson(publishedAgain)) as any).idempotent).toBe(true)

					const persisted = await db
						.select()
						.from(ProductReview)
						.where(eq(ProductReview.id, createdBody.reviewId))
						.then((rows) => rows[0])
					expect(String(persisted?.status)).toBe("published")
					expect(Number(persisted?.rating)).toBe(5)
				}
			)
		},
		60_000
	)

	it(
		"records cross-sell impression/click and closes booking_attributed",
		async () => {
			process.env.LOCAL_QA_AUTH_ENABLED = "false"
			process.env.TOURS_PUBLIC_SEARCH_ENABLED = "true"
			const suffix = crypto.randomUUID().slice(0, 8)
			const guestToken = `t_guest_${suffix}`
			const guestId = `u_guest_${suffix}`
			const hotelProductId = `prod_hotel_xs_${suffix}`
			const tourProductId = `prod_tour_xs_${suffix}`
			const geoPlaceId = `dest_xs_${suffix}`
			const variantId = `var_xs_${suffix}`
			const ratePlanId = `rp_xs_${suffix}`
			const bookingId = crypto.randomUUID()
			const departure = "2026-12-01"
			const stay = tourDepartureToStay(departure)
			const occupancyKey = buildOccupancyKey({ adults: 1, children: 0, infants: 0 })

			await db.insert(Provider).values({ id: "prov_test", legalName: "P" }).onConflictDoNothing()
			await db.insert(User).values({ id: guestId, email: `xs-${suffix}@ex.com` } as any)
			await db.insert(GeoPlace).values({
				id: geoPlaceId,
				canonicalName: `XS Dest ${geoPlaceId}`,
				normalizedName: `xs dest ${geoPlaceId}`.replace(/_/g, "-"),
				placeType: "city",
				countryCode: "BO",
				slug: geoPlaceId.replace(/_/g, "-"),
				canonicalPath: geoPlaceId.replace(/_/g, "-"),
			} as any)
			await db.insert(Product).values({
				id: hotelProductId,
				name: "Hotel XS",
				productType: "Hotel",
				providerId: "prov_test",
			} as any)
			await db.insert(ProductGeoPlace).values({ id: `test-primary-${hotelProductId}`, productId: hotelProductId, placeId: geoPlaceId, role: "primary_discovery", isPrimary: true, source: "test_fixture" } as any)
			await db.insert(Product).values({
				id: tourProductId,
				name: "Tour XS",
				productType: "Tour",
				providerId: "prov_test",
			} as any)
			await db.insert(ProductGeoPlace).values({ id: `test-primary-${tourProductId}`, productId: tourProductId, placeId: geoPlaceId, role: "primary_discovery", isPrimary: true, source: "test_fixture" } as any)
			await db
				.update(Product)
				.set({ publicationState: "published", publicationUpdatedAt: new Date() })
				.where(eq(Product.id, tourProductId))
			await db.insert(Tour).values({
				productId: tourProductId,
				durationMinutes: 120,
				difficultyLevel: "easy",
				meetingPointJson: { address: "Plaza" },
				itineraryJson: ["A", "B", "C"],
			} as any)
			await db.insert(Variant).values({
				id: variantId,
				productId: tourProductId,
				kind: "tour_slot",
				name: "AM",
				status: "ready",
				isActive: true,
				createdAt: new Date(),
			} as any)
			await db.insert(TourSlotProfile).values({
				variantId,
				departureTime: "09:00",
				maxPax: 10,
				languageCode: "es",
				bookingMode: "shared",
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any)
			await db.insert(RatePlan).values({
				id: ratePlanId,
				variantId,
				name: "Std",
				isDefault: true,
				isActive: true,
				createdAt: new Date(),
			} as any)
			await db.insert(SearchUnitView).values({
				id: `suv_xs_${suffix}`,
				variantId,
				productId: tourProductId,
				ratePlanId,
				date: stay.checkIn.toISOString().slice(0, 10),
				occupancyKey,
				totalGuests: 1,
				hasAvailability: true,
				hasPrice: true,
				isAvailable: true,
				availableUnits: 5,
				pricePerNight: 45,
				currency: "USD",
				primaryBlocker: null,
				cta: false,
				ctd: false,
				computedAt: new Date(),
				sourceVersion: "test",
			} as any)
			await db.insert(Booking).values({
				id: bookingId,
				providerId: "prov_test",
				userId: guestId,
				ratePlanId,
				checkInDate: departure,
				checkOutDate: stay.checkOut.toISOString().slice(0, 10),
				numAdults: 1,
				status: "confirmed",
				operationalStatus: "pending_arrival",
				currency: "USD",
				totalAmount: 45,
				source: "web",
				confirmedAt: new Date(),
			} as any)

			const crossSell = await loadHotelTourCrossSell({
				geoPlaceId,
				checkIn: departure,
				surface: "hotel_pdp",
				excludeProductId: hotelProductId,
			})
			expect(crossSell.cards.some((c) => c.productId === tourProductId)).toBe(true)

			const impression = await marketplacePost({
				request: makeAuthedJsonRequest({
					path: "/api/telemetry/marketplace",
					body: {
						eventType: "impression",
						surface: "hotel_pdp",
						sourceProductId: hotelProductId,
						geoPlaceId,
						sessionId: `sess_${suffix}`,
					},
				}),
			} as any)
			expect(impression.status).toBe(202)

			const click = await marketplacePost({
				request: makeAuthedJsonRequest({
					path: "/api/telemetry/marketplace",
					body: {
						eventType: "click",
						surface: "hotel_pdp",
						sourceProductId: hotelProductId,
						targetProductId: tourProductId,
						geoPlaceId,
						sessionId: `sess_${suffix}`,
					},
				}),
			} as any)
			expect(click.status).toBe(202)

			const unauthAttr = await marketplacePost({
				request: makeAuthedJsonRequest({
					path: "/api/telemetry/marketplace",
					body: {
						eventType: "booking_attributed",
						surface: "hotel_pdp",
						sourceProductId: hotelProductId,
						targetProductId: tourProductId,
						bookingId,
						sessionId: `sess_${suffix}`,
					},
				}),
			} as any)
			expect(unauthAttr.status).toBe(401)

			await withSupabaseAuthStub(
				{ [guestToken]: { id: guestId, email: `xs-${suffix}@ex.com` } },
				async () => {
					const attributed = await marketplacePost({
						request: makeAuthedJsonRequest({
							path: "/api/telemetry/marketplace",
							token: guestToken,
							body: {
								eventType: "booking_attributed",
								surface: "hotel_pdp",
								sourceProductId: hotelProductId,
								targetProductId: tourProductId,
								geoPlaceId,
								bookingId,
								sessionId: `sess_${suffix}`,
							},
						}),
					} as any)
					expect([200, 202]).toContain(attributed.status)
					const firstBody = (await readJson(attributed)) as any
					expect(firstBody.ok).toBe(true)

					const again = await marketplacePost({
						request: makeAuthedJsonRequest({
							path: "/api/telemetry/marketplace",
							token: guestToken,
							body: {
								eventType: "booking_attributed",
								surface: "hotel_pdp",
								sourceProductId: hotelProductId,
								targetProductId: tourProductId,
								bookingId,
								sessionId: `sess_${suffix}`,
							},
						}),
					} as any)
					expect(again.status).toBe(200)
					expect(((await readJson(again)) as any).idempotent).toBe(true)
				}
			)

			const events = await db
				.select()
				.from(MarketplaceEvent)
				.where(eq(MarketplaceEvent.bookingId, bookingId))
			expect(events.some((e) => String(e.eventType) === "booking_attributed")).toBe(true)
			expect(events.filter((e) => String(e.eventType) === "booking_attributed")).toHaveLength(1)
		},
		60_000
	)

	it(
		"voids tour voucher on cancel (happy path + auth negative + idempotent cancel state)",
		async () => {
			process.env.LOCAL_QA_AUTH_ENABLED = "false"
			process.env.TOURS_CHECKOUT_ENABLED = "true"
			process.env.TOURS_CHECKIN_ENABLED = "true"
			process.env.INVENTORY_MUTATION_TIMEOUT_MS = "60000"
			process.env.INVENTORY_RECOMPUTE_CHAIN_TIMEOUT_MS = "60000"
			process.env.FASTT_CACHE_L1_TTL_SECONDS = "900"

			const suffix = crypto.randomUUID().slice(0, 8)
			const guestToken = `t_guest_${suffix}`
			const providerToken = `t_prov_${suffix}`
			const foreignToken = `t_foreign_${suffix}`
			const guestId = `u_guest_${suffix}`
			const providerUserId = `u_prov_${suffix}`
			const foreignUserId = `u_foreign_${suffix}`
			const foreignProviderId = `prov_foreign_${suffix}`
			const productId = `prod_void_${suffix}`
			const geoPlaceId = `dest_void_${suffix}`
			const variantId = `var_void_${suffix}`
			const ratePlanId = `rp_void_${suffix}`
			const departure = "2026-10-25"
			const stay = tourDepartureToStay(departure)
			const checkIn = stay.checkIn.toISOString().slice(0, 10)
			const checkOut = stay.checkOut.toISOString().slice(0, 10)
			const occupancyKey = buildOccupancyKey({ adults: 1, children: 0, infants: 0 })

			await db.insert(Provider).values({ id: "prov_test", legalName: "P" }).onConflictDoNothing()
			await db.insert(Provider).values({ id: foreignProviderId, legalName: "F" } as any)
			await db.insert(User).values({ id: guestId, email: `void-g-${suffix}@ex.com` } as any)
			await db.insert(User).values({
				id: providerUserId,
				email: `void-p-${suffix}@ex.com`,
			} as any)
			await db.insert(User).values({
				id: foreignUserId,
				email: `void-f-${suffix}@ex.com`,
			} as any)
			await db.insert(ProviderUser).values({
				id: `pu_void_${suffix}`,
				providerId: "prov_test",
				userId: providerUserId,
				role: "owner",
			} as any)
			await db.insert(ProviderUser).values({
				id: `pu_void_f_${suffix}`,
				providerId: foreignProviderId,
				userId: foreignUserId,
				role: "owner",
			} as any)
			await db.insert(GeoPlace).values({
				id: geoPlaceId,
				canonicalName: `Void Dest ${geoPlaceId}`,
				normalizedName: `void dest ${geoPlaceId}`.replace(/_/g, "-"),
				placeType: "city",
				countryCode: "BO",
				slug: geoPlaceId.replace(/_/g, "-"),
				canonicalPath: geoPlaceId.replace(/_/g, "-"),
			} as any)
			await db.insert(Product).values({
				id: productId,
				name: "Void Tour",
				productType: "Tour",
				providerId: "prov_test",
			} as any)
			await db.insert(ProductGeoPlace).values({ id: `test-primary-${productId}`, productId, placeId: geoPlaceId, role: "primary_discovery", isPrimary: true, source: "test_fixture" } as any)
			await markProductPublished(productId)
			await db.insert(Tour).values({
				productId,
				durationMinutes: 90,
				meetingPointJson: { address: "Plaza" },
				itineraryJson: ["A"],
			} as any)
			await db.insert(Variant).values({
				id: variantId,
				productId,
				kind: "tour_slot",
				name: "AM",
				status: "ready",
				isActive: true,
				createdAt: new Date(),
			} as any)
			await db.insert(TourSlotProfile).values({
				variantId,
				departureTime: "09:00",
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
				name: "Std",
				isDefault: true,
				isActive: true,
				createdAt: new Date(),
			} as any)

			for (const policy of [
				await createPolicyCapa6({
					ownerProviderId: "prov_test",
					category: "Cancellation",
					description: "Flexible",
					cancellationTiers: [
						{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 0 },
					],
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

			await db.insert(EffectivePricingV2).values({
				id: `ep_${suffix}`,
				variantId,
				ratePlanId,
				date: checkIn,
				occupancyKey,
				baseComponent: 80,
				occupancyAdjustment: 0,
				ruleAdjustment: 0,
				finalBasePrice: 80,
				currency: "USD",
				computedAt: new Date(),
				sourceVersion: "test",
			} as any)
			await db.insert(DailyInventory).values({
				id: `di_${suffix}`,
				variantId,
				date: checkIn,
				totalInventory: 8,
				reservedCount: 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as any)
			await db.insert(EffectiveAvailability).values({
				id: `ea_${suffix}`,
				variantId,
				date: checkIn,
				totalUnits: 8,
				heldUnits: 0,
				bookedUnits: 0,
				availableUnits: 8,
				computedAt: new Date(),
			} as any)
			await db.insert(SearchUnitView).values({
				id: `suv_void_${suffix}`,
				variantId,
				productId,
				ratePlanId,
				date: checkIn,
				occupancyKey,
				totalGuests: 1,
				hasAvailability: true,
				hasPrice: true,
				isAvailable: true,
				availableUnits: 8,
				pricePerNight: 80,
				currency: "USD",
				primaryBlocker: null,
				cta: false,
				ctd: false,
				computedAt: new Date(),
				sourceVersion: "test",
			} as any)

			await withSupabaseAuthStub(
				{
					[guestToken]: { id: guestId, email: `void-g-${suffix}@ex.com` },
					[providerToken]: { id: providerUserId, email: `void-p-${suffix}@ex.com` },
					[foreignToken]: { id: foreignUserId, email: `void-f-${suffix}@ex.com` },
				},
				async () => {
					const holdRes = await holdPost({
						request: makeAuthedJsonRequest({
							path: "/api/inventory/hold",
							token: guestToken,
							body: {
								variantId,
								ratePlanId,
								dateRange: { from: checkIn, to: checkOut },
								rooms: 1,
								occupancyDetail: { adults: 1, children: 0, infants: 0 },
							},
						}),
					} as any)
					const holdPayload = (await readJson(holdRes)) as any
					expect(holdRes.status).toBe(200)
					const holdId = String(holdPayload.holdId)

					const confirmRes = await bookingConfirmPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/confirm",
							token: guestToken,
							body: { holdId },
						}),
					} as any)
					expect(confirmRes.status).toBe(200)
					const confirmBody = (await readJson(confirmRes)) as any
					const bookingId = String(confirmBody.bookingId)
					expect(bookingId).toBeTruthy()

					const voucherBefore = await db
						.select()
						.from(BookingVoucher)
						.where(eq(BookingVoucher.bookingId, bookingId))
						.then((rows) => rows[0])
					expect(String(voucherBefore?.status)).toBe("issued")

					const guestCancel = await bookingCancelPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/cancel",
							token: guestToken,
							body: { bookingId, reason: "guest_cancelled" },
						}),
					} as any)
					expect(guestCancel.status).toBeGreaterThanOrEqual(400)

					const foreignCancel = await bookingCancelPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/cancel",
							token: foreignToken,
							body: { bookingId, reason: "guest_cancelled" },
						}),
					} as any)
					expect(foreignCancel.status).toBe(404)

					const cancelRes = await bookingCancelPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/cancel",
							token: providerToken,
							body: { bookingId, reason: "guest_cancelled" },
						}),
					} as any)
					expect(cancelRes.status).toBe(200)
					const cancelBody = (await readJson(cancelRes)) as any
					expect(cancelBody.status).toBe("cancelled")
					expect(cancelBody.voucherStatus).toBe("void")

					const voucherAfter = await db
						.select()
						.from(BookingVoucher)
						.where(eq(BookingVoucher.bookingId, bookingId))
						.then((rows) => rows[0])
					expect(String(voucherAfter?.status)).toBe("void")

					const bookingAfter = await db
						.select()
						.from(Booking)
						.where(eq(Booking.id, bookingId))
						.then((rows) => rows[0])
					expect(String(bookingAfter?.status)).toBe("cancelled")

					// Second cancel is idempotent: booking stays cancelled and voucher stays void.
					const cancelAgain = await bookingCancelPost({
						request: makeAuthedJsonRequest({
							path: "/api/booking/cancel",
							token: providerToken,
							body: { bookingId, reason: "guest_cancelled" },
						}),
					} as any)
					expect(cancelAgain.status).toBe(200)
					const cancelAgainBody = (await readJson(cancelAgain)) as any
					expect(cancelAgainBody.status).toBe("cancelled")
					expect(cancelAgainBody.voucherStatus).toBe("void")
					const voucherStill = await db
						.select()
						.from(BookingVoucher)
						.where(eq(BookingVoucher.bookingId, bookingId))
						.then((rows) => rows[0])
					expect(String(voucherStill?.status)).toBe("void")
				}
			)
		},
		180_000
	)
})
