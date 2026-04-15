import { describe, expect, it } from "vitest"

import {
	and,
	Booking,
	db,
	DailyInventory,
	Destination,
	EffectiveAvailability,
	EffectivePricing,
	eq,
	InventoryLock,
	PricingBaseRate,
	Product,
	RatePlan,
	RatePlanTemplate,
	Variant,
} from "astro:db"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as bookingConfirmPost } from "@/pages/api/booking/confirm"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"
import { materializeSearchUnitRange } from "@/modules/search/public"

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

function addDays(dateOnly: string, days: number): string {
	const d = new Date(`${dateOnly}T00:00:00.000Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

async function seedBookingReadyVariant(params: {
	productId: string
	variantId: string
	ratePlanId: string
	totalUnits: number
	dates: string[]
}) {
	const destinationId = `dest_bk_inv_${crypto.randomUUID()}`
	const ratePlanTemplateId = `rpt_bk_inv_${crypto.randomUUID()}`

	await db.insert(Destination).values({
		id: destinationId,
		name: "Booking Inv Dest",
		type: "city",
		country: "CL",
		slug: `bk-inv-${destinationId}`,
	} as any)

	await db.insert(Product).values({
		id: params.productId,
		name: "Booking Inv Product",
		productType: "Hotel",
		destinationId,
		providerId: null,
	} as any)

	await db.insert(Variant).values({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Booking Inv Room",
		status: "ready",
		isActive: true,
		createdAt: new Date(),
	} as any)

	await db.insert(RatePlanTemplate).values({
		id: ratePlanTemplateId,
		name: "Default",
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

	await db.insert(PricingBaseRate).values({
		variantId: params.variantId,
		currency: "USD",
		basePrice: 100,
		createdAt: new Date(),
	} as any)

	for (const date of params.dates) {
		await db.insert(DailyInventory).values({
			id: `di_${crypto.randomUUID()}`,
			variantId: params.variantId,
			date,
			totalInventory: params.totalUnits,
			reservedCount: 0,
			stopSell: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)

		await db.insert(EffectivePricing).values({
			id: `ep_${crypto.randomUUID()}`,
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			date,
			basePrice: 100,
			yieldMultiplier: 1,
			finalBasePrice: 100,
			computedAt: new Date(),
		} as any)
	}

	const from = params.dates[0]
	const to = addDays(params.dates[params.dates.length - 1], 1)
	await recomputeEffectiveAvailabilityRange({
		variantId: params.variantId,
		from,
		to,
		reason: "test_seed",
		idempotencyKey: `test_seed:${params.variantId}`,
	})
	await materializeSearchUnitRange({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		from,
		to,
		currency: "USD",
	})
}

describe("integration/booking -> inventory materialization", () => {
	it("booking confirmation transitions held to booked and recomputes exact hold range", async () => {
		const token = "t_booking_inv"
		const email = "booking-inv@example.com"
		const productId = `prod_bk_inv_${crypto.randomUUID()}`
		const variantId = `var_bk_inv_${crypto.randomUUID()}`
		const ratePlanId = `rp_bk_inv_${crypto.randomUUID()}`
		const checkIn = "2026-04-10"
		const checkOut = "2026-04-13"

		await seedBookingReadyVariant({
			productId,
			variantId,
			ratePlanId,
			totalUnits: 3,
			dates: ["2026-04-10", "2026-04-11", "2026-04-12", "2026-04-13"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_booking_inv", email } }, async () => {
			const holdForm = new FormData()
			holdForm.set("variantId", variantId)
			holdForm.set("checkIn", checkIn)
			holdForm.set("checkOut", checkOut)
			holdForm.set("quantity", "1")

			const holdRes = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: holdForm }),
			} as any)
			expect(holdRes.status).toBe(200)
			const holdBody = (await readJson(holdRes)) as any
			const holdId = String(holdBody?.holdId ?? "")
			expect(holdId.length).toBeGreaterThan(0)

			const confirmForm = new FormData()
			confirmForm.set("holdId", holdId)
			const confirmOnce = async () =>
				bookingConfirmPost({
					request: makeAuthedFormRequest({
						path: "/api/booking/confirm",
						token,
						form: confirmForm,
					}),
				} as any)

			const [confirmResA, confirmResB] = await Promise.all([confirmOnce(), confirmOnce()])
			expect(confirmResA.status).toBe(200)
			expect(confirmResB.status).toBe(200)
			const confirmBodyA = (await readJson(confirmResA)) as any
			const confirmBodyB = (await readJson(confirmResB)) as any
			const bookingId = String(confirmBodyA?.bookingId ?? "")
			expect(bookingId.length).toBeGreaterThan(0)
			expect(String(confirmBodyB?.bookingId ?? "")).toBe(bookingId)

			const lockRows = await db
				.select()
				.from(InventoryLock)
				.where(eq(InventoryLock.holdId, holdId))
				.all()
			expect(lockRows.length).toBe(3)
			expect(lockRows.every((row: any) => String(row.bookingId ?? "") === bookingId)).toBe(true)

			const impactedDates = ["2026-04-10", "2026-04-11", "2026-04-12"]
			for (const date of impactedDates) {
				const ea = await db
					.select()
					.from(EffectiveAvailability)
					.where(
						and(
							eq(EffectiveAvailability.variantId, variantId),
							eq(EffectiveAvailability.date, date)
						)
					)
					.get()
				expect(ea).toBeTruthy()
				const totalUnits = Number((ea as any).totalUnits ?? 0)
				const heldUnits = Number((ea as any).heldUnits ?? 0)
				const bookedUnits = Number((ea as any).bookedUnits ?? 0)
				const availableUnits = Number((ea as any).availableUnits ?? 0)
				expect(heldUnits).toBe(0)
				expect(bookedUnits).toBe(1)
				expect(availableUnits).toBe(2)
				expect(heldUnits + bookedUnits + availableUnits).toBe(totalUnits)
			}

			const outside = await db
				.select()
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, variantId),
						eq(EffectiveAvailability.date, "2026-04-13")
					)
				)
				.get()
			expect(outside == null || Number((outside as any).bookedUnits ?? 0) === 0).toBe(true)

			const bookingRows = await db.select().from(Booking).where(eq(Booking.id, bookingId)).all()
			expect(bookingRows.length).toBe(1)

			for (const date of impactedDates) {
				const ea = await db
					.select()
					.from(EffectiveAvailability)
					.where(
						and(
							eq(EffectiveAvailability.variantId, variantId),
							eq(EffectiveAvailability.date, date)
						)
					)
					.get()
				expect(Number((ea as any)?.heldUnits ?? 0)).toBe(0)
				expect(Number((ea as any)?.bookedUnits ?? 0)).toBe(1)
				expect(Number((ea as any)?.availableUnits ?? 0)).toBe(2)
			}
		})
	})
})
