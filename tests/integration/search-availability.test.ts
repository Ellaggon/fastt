import { describe, it, expect } from "vitest"

import { searchOffers, dailyInventoryRepository, baseRateRepository } from "@/container"
import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { assignPolicyCapa6, createPolicyCapa6 } from "@/modules/policies/public"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { materializeSearchUnitRange } from "@/modules/search/public"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"
import { buildOccupancyKey } from "@/shared/domain/occupancy"

import {
	db,
	EffectiveAvailability,
	EffectivePricingV2,
	EffectiveRestriction,
	Restriction,
	SearchUnitView,
	Variant,
	and,
	eq,
} from "astro:db"

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
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
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

async function seedSearchableVariant(params: {
	email: string
	providerId: string
	destinationId: string
	productId: string
	variantId: string
	ratePlanTemplateId: string
	ratePlanId: string
	inventoryDates: string[]
	totalInventory: number
	stopSell?: boolean
	materializeCheckoutDay?: boolean
	variantIsActive?: boolean
	variantStatus?: "draft" | "ready" | "sellable" | "archived"
}) {
	await upsertDestination({
		id: params.destinationId,
		name: "Dest",
		type: "city",
		country: "CL",
		slug: `dest-${params.destinationId}`,
	})
	await upsertProvider({ id: params.providerId, displayName: "Prov", ownerEmail: params.email })
	await upsertProduct({
		id: params.productId,
		name: "Hotel",
		productType: "Hotel",
		destinationId: params.destinationId,
		providerId: params.providerId,
	})
	await upsertVariant({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Room",
		currency: "USD",
		basePrice: 999,
		isActive: params.variantIsActive ?? true,
	})
	if (params.variantStatus) {
		await db
			.update(Variant)
			.set({
				status: params.variantStatus,
			} as any)
			.where(and(eq(Variant.id, params.variantId), eq(Variant.productId, params.productId)))
	}

	for (const d of params.inventoryDates) {
		await dailyInventoryRepository.upsert({
			id: `di_${crypto.randomUUID()}`,
			variantId: params.variantId,
			date: d,
			totalInventory: params.totalInventory,
			reservedCount: 0,
		})
		await db
			.insert(EffectiveAvailability)
			.values({
				id: `ea_${params.variantId}_${d}`,
				variantId: params.variantId,
				date: d,
				totalUnits: params.totalInventory,
				heldUnits: 0,
				bookedUnits: 0,
				availableUnits: params.stopSell ? 0 : params.totalInventory,
				stopSell: params.stopSell ?? false,
				isSellable: !Boolean(params.stopSell ?? false) && params.totalInventory > 0,
				computedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
				set: {
					totalUnits: params.totalInventory,
					heldUnits: 0,
					bookedUnits: 0,
					availableUnits: params.stopSell ? 0 : params.totalInventory,
					stopSell: params.stopSell ?? false,
					isSellable: !Boolean(params.stopSell ?? false) && params.totalInventory > 0,
					computedAt: new Date(),
				},
			})
	}

	await upsertRatePlanTemplate({
		id: params.ratePlanTemplateId,
		name: "Default",
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlan({
		id: params.ratePlanId,
		templateId: params.ratePlanTemplateId,
		variantId: params.variantId,
		isActive: true,
		isDefault: true,
	})
	await baseRateRepository.setCanonicalBaseForRatePlan({
		ratePlanId: params.ratePlanId,
		currency: "USD",
		basePrice: 100,
	})

	const cancellation = await createPolicyCapa6({
		category: "Cancellation",
		description: "Flexible cancellation",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
		cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
	} as any)
	const payment = await createPolicyCapa6({
		category: "Payment",
		description: "Pay at property",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
		rules: { paymentType: "pay_at_property" },
	} as any)
	const checkIn = await createPolicyCapa6({
		category: "CheckIn",
		description: "Standard check-in",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
		rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
	} as any)
	const noShow = await createPolicyCapa6({
		category: "NoShow",
		description: "No-show first night",
		effectiveFrom: "2026-01-01",
		effectiveTo: "2026-12-31",
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

	if (typeof params.totalInventory === "number") {
		const nightly = Number(100)
		await Promise.all(
			params.inventoryDates.map(async (date) => {
				await db
					.insert(EffectivePricingV2)
					.values({
						variantId: params.variantId,
						ratePlanId: params.ratePlanId,
						date,
						occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
						baseComponent: nightly,
						finalBasePrice: nightly,

						computedAt: new Date(),
					} as any)
					.onConflictDoUpdate({
						target: [
							EffectivePricingV2.variantId,
							EffectivePricingV2.ratePlanId,
							EffectivePricingV2.date,
							EffectivePricingV2.occupancyKey,
						],
						set: {
							baseComponent: nightly,
							finalBasePrice: nightly,
							computedAt: new Date(),
						},
					})
			})
		)
	}

	const sorted = [...params.inventoryDates].sort()
	const from = sorted[0]
	const to = new Date(`${sorted[sorted.length - 1]}T00:00:00.000Z`)
	const extraDays = params.materializeCheckoutDay === false ? 1 : 2
	// inventoryDates are stay nights ([from, checkOut)); optional extra day simulates checkout materialization.
	to.setUTCDate(to.getUTCDate() + extraDays)
	for (const adults of [1, 2]) {
		await ensurePricingCoverageForRequestRuntime({
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			checkIn: from,
			checkOut: to.toISOString().slice(0, 10),
			occupancy: { adults, children: 0, infants: 0 },
		})
	}
	await materializeSearchUnitRange({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		from,
		to: to.toISOString().slice(0, 10),
		currency: "USD",
	})
}

describe("integration/search availability correctness (CAPA 5 Phase 3)", () => {
	it("status-ready variant remains searchable even if legacy isActive=false", async () => {
		const email = "search-status-ready@example.com"
		const providerId = "prov_search_status_ready"
		const destinationId = "dest_search_status_ready"
		const productId = `prod_search_status_ready_${crypto.randomUUID()}`
		const variantId = `var_search_status_ready_${crypto.randomUUID()}`
		const templateId = `rpt_search_status_ready_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_status_ready_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-04-21", "2026-04-22", "2026-04-23"],
			totalInventory: 1,
			variantIsActive: false,
			variantStatus: "ready",
		})

		const offers = await searchOffers({
			productId,
			checkIn: new Date("2026-04-21"),
			checkOut: new Date("2026-04-24"),
			rooms: 1,
			adults: 1,
			children: 0,
		})

		expect(offers.some((offer) => offer.variantId === variantId)).toBe(true)
		const variantOffer = offers.find((offer) => offer.variantId === variantId)
		expect(variantOffer?.ratePlans.some((rp) => rp.ratePlanId === ratePlanId)).toBe(true)
	})

	it("valid available range: sellable with correct nights and aggregated total without checkout-day row", async () => {
		const email = "search-range@example.com"
		const providerId = "prov_search_range"
		const destinationId = "dest_search_range"
		const productId = `prod_search_range_${crypto.randomUUID()}`
		const variantId = `var_search_range_${crypto.randomUUID()}`
		const templateId = `rpt_search_range_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_range_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-03-10", "2026-03-11"],
			totalInventory: 1,
			materializeCheckoutDay: false,
		})

		const offers = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-12"),
			rooms: 1,
			adults: 2,
			children: 0,
		})
		const variantOffer = offers.find((offer) => offer.variantId === variantId)
		expect(Boolean(variantOffer)).toBe(true)
		const ratePlan = variantOffer?.ratePlans.find((row) => row.ratePlanId === ratePlanId)
		expect(Boolean(ratePlan)).toBe(true)
		expect(ratePlan?.totalPrice).toBe(200)
		expect(ratePlan?.basePrice).toBe(200)
	})

	it("materialized rows remain searchable even when computedAt is old", async () => {
		const email = "search-stale-view@example.com"
		const providerId = "prov_search_stale_view"
		const destinationId = "dest_search_stale_view"
		const productId = `prod_search_stale_view_${crypto.randomUUID()}`
		const variantId = `var_search_stale_view_${crypto.randomUUID()}`
		const templateId = `rpt_search_stale_view_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_stale_view_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-04-21", "2026-04-22", "2026-04-23"],
			totalInventory: 1,
		})

		await db
			.update(SearchUnitView)
			.set({
				computedAt: new Date("2025-01-01T00:00:00.000Z"),
			} as any)
			.where(
				and(eq(SearchUnitView.variantId, variantId), eq(SearchUnitView.ratePlanId, ratePlanId))
			)

		const offers = await searchOffers({
			productId,
			checkIn: new Date("2026-04-21"),
			checkOut: new Date("2026-04-24"),
			rooms: 1,
			adults: 1,
			children: 0,
		})

		const variantOffer = offers.find((offer) => offer.variantId === variantId)
		expect(Boolean(variantOffer)).toBe(true)
		const ratePlan = variantOffer?.ratePlans.find((row) => row.ratePlanId === ratePlanId)
		expect(Boolean(ratePlan)).toBe(true)
		expect(Number(ratePlan?.totalPrice ?? 0)).toBeGreaterThan(0)
	})

	it("quantity-aware: rooms=1/2 available, rooms=3 not available (totalInventory=2)", async () => {
		const email = "search-qty@example.com"
		const providerId = "prov_search_qty"
		const destinationId = "dest_search_qty"
		const productId = `prod_search_qty_${crypto.randomUUID()}`
		const variantId = `var_search_qty_${crypto.randomUUID()}`
		const templateId = `rpt_search_qty_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_qty_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-03-10"],
			totalInventory: 2,
		})

		const offers1 = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-11"),
			rooms: 1,
			adults: 2,
			children: 0,
		})
		expect(offers1.some((o) => o.variantId === variantId)).toBe(true)

		const offers2 = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-11"),
			rooms: 2,
			adults: 2,
			children: 0,
		})
		expect(offers2.some((o) => o.variantId === variantId)).toBe(true)

		const offers3 = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-11"),
			rooms: 3,
			adults: 2,
			children: 0,
		})
		expect(offers3.some((o) => o.variantId === variantId)).toBe(false)
	})

	it("full stay strict: if any night is unavailable, reject entire stay", async () => {
		const email = "search-stay@example.com"
		const providerId = "prov_search_stay"
		const destinationId = "dest_search_stay"
		const productId = `prod_search_stay_${crypto.randomUUID()}`
		const variantId = `var_search_stay_${crypto.randomUUID()}`
		const templateId = `rpt_search_stay_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_stay_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-03-10", "2026-03-11", "2026-03-12"],
			totalInventory: 1,
		})

		// Make one night sold out.
		await dailyInventoryRepository.upsert({
			id: `di_${crypto.randomUUID()}`,
			variantId,
			date: "2026-03-11",
			totalInventory: 1,
			reservedCount: 1,
		})
		await db
			.insert(EffectiveAvailability)
			.values({
				id: `ea_${variantId}_2026-03-11`,
				variantId,
				date: "2026-03-11",
				totalUnits: 1,
				heldUnits: 0,
				bookedUnits: 1,
				availableUnits: 0,
				stopSell: false,
				isSellable: false,
				computedAt: new Date(),
			} as any)
			.onConflictDoUpdate({
				target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
				set: {
					totalUnits: 1,
					heldUnits: 0,
					bookedUnits: 1,
					availableUnits: 0,
					stopSell: false,
					isSellable: false,
					computedAt: new Date(),
				},
			})

		for (const adults of [1, 2]) {
			await ensurePricingCoverageForRequestRuntime({
				variantId,
				ratePlanId,
				checkIn: "2026-03-10",
				checkOut: "2026-03-14",
				occupancy: { adults, children: 0, infants: 0 },
			})
		}
		for (const adults of [1, 2]) {
			await ensurePricingCoverageForRequestRuntime({
				variantId,
				ratePlanId,
				checkIn: "2026-03-10",
				checkOut: "2026-03-12",
				occupancy: { adults, children: 0, infants: 0 },
			})
		}
		await materializeSearchUnitRange({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			// Include checkout day (+1).
			to: "2026-03-14",
			currency: "USD",
		})

		const offers = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-13"),
			rooms: 1,
			adults: 2,
			children: 0,
		})

		expect(offers.some((o) => o.variantId === variantId)).toBe(false)
	})

	it("missing day: if EffectiveAvailability is missing one day, Search rejects the full stay", async () => {
		const email = "search-missing@example.com"
		const providerId = "prov_search_missing"
		const destinationId = "dest_search_missing"
		const productId = `prod_search_missing_${crypto.randomUUID()}`
		const variantId = `var_search_missing_${crypto.randomUUID()}`
		const templateId = `rpt_search_missing_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_missing_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			// Intentionally missing 2026-03-11 for a 2-night stay.
			inventoryDates: ["2026-03-10"],
			totalInventory: 2,
		})

		const offers = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-12"),
			rooms: 1,
			adults: 2,
			children: 0,
		})
		expect(offers.some((o) => o.variantId === variantId)).toBe(false)
	})

	it("hold consistency: active holds decrement availability via materialized availability", async () => {
		const token = "t_search_hold"
		const email = "search-hold@example.com"
		const providerId = "prov_search_hold"
		const destinationId = "dest_search_hold"
		const productId = `prod_search_hold_${crypto.randomUUID()}`
		const variantId = `var_search_hold_${crypto.randomUUID()}`
		const templateId = `rpt_search_hold_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_hold_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-03-10"],
			totalInventory: 2,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_search_hold", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-03-10")
			fd.set("checkOut", "2026-03-11")
			fd.set("quantity", "2")
			const res = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)

			const offers = await searchOffers({
				productId,
				checkIn: new Date("2026-03-10"),
				checkOut: new Date("2026-03-11"),
				rooms: 1,
				adults: 2,
				children: 0,
			})
			expect(offers.some((o) => o.variantId === variantId)).toBe(false)
		})
	})

	it("booking confirmed consumes availability and search reflects booked stock", async () => {
		const token = "t_search_booking"
		const email = "search-booking@example.com"
		const providerId = "prov_search_booking"
		const destinationId = "dest_search_booking"
		const productId = `prod_search_booking_${crypto.randomUUID()}`
		const variantId = `var_search_booking_${crypto.randomUUID()}`
		const templateId = `rpt_search_booking_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_booking_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-03-10"],
			totalInventory: 1,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_search_booking", email } }, async () => {
			const hold = new FormData()
			hold.set("variantId", variantId)
			hold.set("ratePlanId", ratePlanId)
			hold.set("checkIn", "2026-03-10")
			hold.set("checkOut", "2026-03-11")
			hold.set("quantity", "1")
			const holdRes = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: hold }),
			} as any)
			expect(holdRes.status).toBe(200)
			const holdBody = (await readJson(holdRes)) as any

			const confirm = new FormData()
			confirm.set("holdId", String(holdBody?.holdId ?? ""))
			const confirmRes = await bookingConfirmPost({
				request: makeAuthedFormRequest({ path: "/api/booking/confirm", token, form: confirm }),
			} as any)
			expect(confirmRes.status).toBe(200)

			const offers = await searchOffers({
				productId,
				checkIn: new Date("2026-03-10"),
				checkOut: new Date("2026-03-11"),
				rooms: 1,
				adults: 2,
				children: 0,
			})
			expect(offers.some((o) => o.variantId === variantId)).toBe(false)
		})
	})

	it("stop sell restriction: if any stop_sell applies at variant scope, Search rejects", async () => {
		const email = "search-stopsell@example.com"
		const providerId = "prov_search_stopsell"
		const destinationId = "dest_search_stopsell"
		const productId = `prod_search_stopsell_${crypto.randomUUID()}`
		const variantId = `var_search_stopsell_${crypto.randomUUID()}`
		const templateId = `rpt_search_stopsell_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_stopsell_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-03-10"],
			totalInventory: 2,
		})

		await db.insert(Restriction).values({
			id: `r_${crypto.randomUUID()}`,
			scope: "variant",
			scopeId: variantId,
			type: "stop_sell",
			value: null,
			startDate: "2026-03-01",
			endDate: "2026-03-31",
			validDays: null,
			isActive: true,
			priority: 1,
			createdAt: new Date(),
		} as any)

		// SearchUnitView materialization reads from EffectiveRestriction (not raw Restriction).
		for (const date of ["2026-03-10", "2026-03-11"]) {
			await db
				.insert(EffectiveRestriction)
				.values({
					id: `er_${variantId}_${date}`,
					variantId,
					date,
					stopSell: true,
					minStay: null,
					cta: false,
					ctd: false,
					computedAt: new Date(),
				} as any)
				.onConflictDoUpdate({
					target: [EffectiveRestriction.variantId, EffectiveRestriction.date],
					set: {
						stopSell: true,
						minStay: null,
						cta: false,
						ctd: false,
						computedAt: new Date(),
					},
				})
		}

		await materializeSearchUnitRange({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			// Include checkout day (+1).
			to: "2026-03-12",
			currency: "USD",
		})

		const offers = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-11"),
			rooms: 1,
			adults: 2,
			children: 0,
		})
		expect(offers.some((o) => o.variantId === variantId)).toBe(false)
	})

	it("invalid range: checkOut <= checkIn returns empty offers", async () => {
		const email = "search-invalid-range@example.com"
		const providerId = "prov_search_invalid_range"
		const destinationId = "dest_search_invalid_range"
		const productId = `prod_search_invalid_range_${crypto.randomUUID()}`
		const variantId = `var_search_invalid_range_${crypto.randomUUID()}`
		const templateId = `rpt_search_invalid_range_${crypto.randomUUID()}`
		const ratePlanId = `rp_search_invalid_range_${crypto.randomUUID()}`

		await seedSearchableVariant({
			email,
			providerId,
			destinationId,
			productId,
			variantId,
			ratePlanTemplateId: templateId,
			ratePlanId,
			inventoryDates: ["2026-03-10"],
			totalInventory: 1,
		})

		const offers = await searchOffers({
			productId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-10"),
			rooms: 1,
			adults: 2,
			children: 0,
		})
		expect(offers).toEqual([])
	})
})
