import { describe, it, expect } from "vitest"

import {
	db,
	DailyInventory,
	EffectiveAvailability,
	EffectivePricingV2,
	InventoryLock,
	RatePlan,
	RatePlanTemplate,
	Variant,
	eq,
	and,
} from "astro:db"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as releasePost } from "@/pages/api/inventory/release"

import {
	recomputeEffectiveAvailabilityRange,
	releaseExpiredHolds,
} from "@/modules/inventory/public"
import { inventoryHoldRepository } from "@/container"
import { materializeSearchUnitRange } from "@/modules/search/public"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"
import { assignPolicyCapa6, createPolicyCapa6 } from "@/modules/policies/public"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
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

async function seedVariantWithInventory(params: {
	variantId: string
	productId: string
	ratePlanId: string
	totalInventory: number
	dates: string[]
}) {
	const destinationId = `dest_hold_${crypto.randomUUID()}`
	await upsertDestination({
		id: destinationId,
		name: "Hold Dest",
		type: "city",
		country: "CL",
		slug: `hold-dest-${destinationId}`,
	})
	await upsertProduct({
		id: params.productId,
		name: "Hold Product",
		productType: "Hotel",
		destinationId,
		providerId: null,
	})

	await db.insert(Variant).values({
		id: params.variantId,
		productId: params.productId,
		kind: "hotel_room",
		name: "Room",
		description: null,
		status: "ready",
		createdAt: new Date(),
		isActive: true,
	} as any)

	const ratePlanTemplateId = `rpt_hold_${crypto.randomUUID()}`
	await db.insert(RatePlanTemplate).values({
		id: ratePlanTemplateId,
		name: "Hold Template",
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

	for (const d of params.dates) {
		await db.insert(DailyInventory).values({
			id: crypto.randomUUID(),
			variantId: params.variantId,
			date: d,
			totalInventory: params.totalInventory,
			reservedCount: 0,
			createdAt: new Date(),
		} as any)
		await db.insert(EffectivePricingV2).values({
			id: `ep_hold_${crypto.randomUUID()}`,
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			date: d,
			occupancyKey: buildOccupancyKey({ adults: 2, children: 0, infants: 0 }),
			baseComponent: 100,
			occupancyAdjustment: 0,
			ruleAdjustment: 0,
			finalBasePrice: 100,
			currency: "USD",
			computedAt: new Date(),
			sourceVersion: "test",
		} as any)
	}
}

async function refreshSearchView(params: {
	variantId: string
	ratePlanId: string
	from: string
	to: string
}) {
	for (const adults of [1, 2]) {
		await ensurePricingCoverageForRequestRuntime({
			variantId: params.variantId,
			ratePlanId: params.ratePlanId,
			checkIn: params.from,
			checkOut: params.to,
			occupancy: { adults, children: 0, infants: 0 },
		})
	}
	await recomputeEffectiveAvailabilityRange({
		variantId: params.variantId,
		from: params.from,
		to: params.to,
		reason: "test_seed",
		idempotencyKey: `test_seed:${params.variantId}:${params.from}:${params.to}`,
	})
	await materializeSearchUnitRange({
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		from: params.from,
		to: params.to,
		currency: "USD",
	})
}

describe("integration/inventory holds (InventoryLock)", () => {
	it("hold success increments reservedCount and inserts locks", async () => {
		const token = "t_hold_ok"
		const email = "hold-ok@example.com"
		const variantId = `var_hold_ok_${crypto.randomUUID()}`
		const productId = `prod_hold_ok_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_ok_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			ratePlanId,
			totalInventory: 2,
			dates: ["2026-03-10", "2026-03-11"],
		})
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			to: "2026-03-13",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_ok", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-03-10")
			fd.set("checkOut", "2026-03-12")
			fd.set("quantity", "1")

			const res = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const body = (await readJson(res)) as any
			expect(typeof body.holdId).toBe("string")

			const d1 = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-10")))
				.get()
			const d2 = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-11")))
				.get()
			expect(d1?.reservedCount).toBe(1)
			expect(d2?.reservedCount).toBe(1)

			const locks = await db
				.select()
				.from(InventoryLock)
				.where(eq(InventoryLock.holdId, body.holdId))
				.all()
			expect(locks.length).toBe(2)

			const eaDay1 = await db
				.select()
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, variantId),
						eq(EffectiveAvailability.date, "2026-03-10")
					)
				)
				.get()
			const eaDay2 = await db
				.select()
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, variantId),
						eq(EffectiveAvailability.date, "2026-03-11")
					)
				)
				.get()
			expect(Number((eaDay1 as any)?.heldUnits ?? 0)).toBe(1)
			expect(Number((eaDay2 as any)?.heldUnits ?? 0)).toBe(1)
			expect(Number((eaDay1 as any)?.availableUnits ?? 0)).toBe(1)
			expect(Number((eaDay2 as any)?.availableUnits ?? 0)).toBe(1)
		})
	})

	it("hold fails when insufficient inventory; no rows modified", async () => {
		const token = "t_hold_fail"
		const email = "hold-fail@example.com"
		const variantId = `var_hold_fail_${crypto.randomUUID()}`
		const productId = `prod_hold_fail_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_fail_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			ratePlanId,
			totalInventory: 1,
			dates: ["2026-03-10", "2026-03-11"],
		})
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			to: "2026-03-13",
		})

		// Pre-reserve 1 on the second day so the range cannot fit quantity=1 across both days.
		await db
			.update(DailyInventory)
			.set({ reservedCount: 1 } as any)
			.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-11")))
			.run()
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			to: "2026-03-13",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_fail", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-03-10")
			fd.set("checkOut", "2026-03-12")
			fd.set("quantity", "1")

			const res = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			expect(res.status).toBe(409)
			const body = (await readJson(res)) as any
			expect(body?.error).toBe("not_holdable")

			// Ensure first day was not incremented (transaction rollback)
			const d1 = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-10")))
				.get()
			const d2 = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-11")))
				.get()
			expect(d1?.reservedCount).toBe(0)
			expect(d2?.reservedCount).toBe(1)
		})
	})

	it("hold fails when stopSell is active on any day in range", async () => {
		const token = "t_hold_closed"
		const email = "hold-closed@example.com"
		const variantId = `var_hold_closed_${crypto.randomUUID()}`
		const productId = `prod_hold_closed_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_closed_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			ratePlanId,
			totalInventory: 2,
			dates: ["2026-03-20", "2026-03-21"],
		})
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-20",
			to: "2026-03-23",
		})

		await db
			.update(DailyInventory)
			.set({ stopSell: true } as any)
			.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-21")))
			.run()
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-20",
			to: "2026-03-23",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_closed", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-03-20")
			fd.set("checkOut", "2026-03-22")
			fd.set("quantity", "1")

			const res = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			expect(res.status).toBe(409)
			const body = (await readJson(res)) as any
			expect(body?.error).toBe("not_holdable")

			const locks = await db
				.select()
				.from(InventoryLock)
				.where(eq(InventoryLock.variantId, variantId))
				.all()
			expect(locks.length).toBe(0)
		})
	})

	it("hold range recompute affects exactly requested stay days", async () => {
		const token = "t_hold_range"
		const email = "hold-range@example.com"
		const variantId = `var_hold_range_${crypto.randomUUID()}`
		const productId = `prod_hold_range_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_range_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			ratePlanId,
			totalInventory: 2,
			dates: ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"],
		})
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			to: "2026-03-14",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_range", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-03-10")
			fd.set("checkOut", "2026-03-13")
			fd.set("quantity", "1")

			const holdRes = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			expect(holdRes.status).toBe(200)

			const rows = await db
				.select()
				.from(EffectiveAvailability)
				.where(eq(EffectiveAvailability.variantId, variantId))
				.all()
			const affectedDates = rows
				.map((row: any) => String(row.date))
				.filter((date) => date >= "2026-03-10" && date < "2026-03-13")
			expect(affectedDates.length).toBe(3)
			expect(affectedDates).toContain("2026-03-10")
			expect(affectedDates).toContain("2026-03-11")
			expect(affectedDates).toContain("2026-03-12")
		})
	})

	it("concurrent safety: two holds race; only one succeeds", async () => {
		const token = "t_hold_race"
		const email = "hold-race@example.com"
		const variantId = `var_hold_race_${crypto.randomUUID()}`
		const productId = `prod_hold_race_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_race_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			ratePlanId,
			totalInventory: 1,
			dates: ["2026-03-10"],
		})
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			to: "2026-03-12",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_race", email } }, async () => {
			const mk = () => {
				const fd = new FormData()
				fd.set("variantId", variantId)
				fd.set("ratePlanId", ratePlanId)
				fd.set("checkIn", "2026-03-10")
				fd.set("checkOut", "2026-03-11")
				fd.set("quantity", "1")
				return holdPost({
					request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
				} as any)
			}

			const [r1, r2] = await Promise.all([mk(), mk()])
			const okCount = [r1.status, r2.status].filter((s) => s === 200).length
			const failCount = [r1.status, r2.status].filter((s) => s === 409).length
			expect(okCount).toBe(1)
			expect(failCount).toBe(1)

			const d = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-10")))
				.get()
			expect(d?.reservedCount).toBe(1)
		})
	})

	it("release hold decrements reservedCount and deletes locks", async () => {
		const token = "t_hold_release"
		const email = "hold-release@example.com"
		const variantId = `var_hold_release_${crypto.randomUUID()}`
		const productId = `prod_hold_release_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_release_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			ratePlanId,
			totalInventory: 2,
			dates: ["2026-03-10", "2026-03-11"],
		})
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			to: "2026-03-13",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_release", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-03-10")
			fd.set("checkOut", "2026-03-12")
			fd.set("quantity", "1")

			const holdRes = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			const holdBody = (await readJson(holdRes)) as any

			const rel = new FormData()
			rel.set("holdId", holdBody.holdId)
			const relRes = await releasePost({
				request: makeAuthedFormRequest({ path: "/api/inventory/release", token, form: rel }),
			} as any)
			expect(relRes.status).toBe(200)

			const d1 = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-10")))
				.get()
			const d2 = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-11")))
				.get()
			expect(d1?.reservedCount).toBe(0)
			expect(d2?.reservedCount).toBe(0)

			const locks = await db
				.select()
				.from(InventoryLock)
				.where(eq(InventoryLock.holdId, holdBody.holdId))
				.all()
			expect(locks.length).toBe(0)

			const eaDay1 = await db
				.select()
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, variantId),
						eq(EffectiveAvailability.date, "2026-03-10")
					)
				)
				.get()
			const eaDay2 = await db
				.select()
				.from(EffectiveAvailability)
				.where(
					and(
						eq(EffectiveAvailability.variantId, variantId),
						eq(EffectiveAvailability.date, "2026-03-11")
					)
				)
				.get()
			expect(Number((eaDay1 as any)?.heldUnits ?? 0)).toBe(0)
			expect(Number((eaDay2 as any)?.heldUnits ?? 0)).toBe(0)
			expect(Number((eaDay1 as any)?.availableUnits ?? 0)).toBe(2)
			expect(Number((eaDay2 as any)?.availableUnits ?? 0)).toBe(2)
		})
	})

	it("expire holds: releaseExpiredHolds removes expired locks and restores reservedCount", async () => {
		const token = "t_hold_exp"
		const email = "hold-exp@example.com"
		const variantId = `var_hold_exp_${crypto.randomUUID()}`
		const productId = `prod_hold_exp_${crypto.randomUUID()}`
		const ratePlanId = `rp_hold_exp_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			ratePlanId,
			totalInventory: 2,
			dates: ["2026-03-10"],
		})
		await refreshSearchView({
			variantId,
			ratePlanId,
			from: "2026-03-10",
			to: "2026-03-12",
		})

		let holdId = ""
		await withSupabaseAuthStub({ [token]: { id: "u_hold_exp", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("ratePlanId", ratePlanId)
			fd.set("checkIn", "2026-03-10")
			fd.set("checkOut", "2026-03-11")
			fd.set("quantity", "1")

			const holdRes = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			expect(holdRes.status).toBe(200)
			const holdBody = (await readJson(holdRes)) as any
			holdId = String(holdBody?.holdId ?? "")
			expect(holdId).toBeTruthy()
		})

		await db
			.update(InventoryLock)
			.set({ expiresAt: new Date(Date.now() - 60_000) } as any)
			.where(eq(InventoryLock.holdId, holdId))
			.run()

		const { releasedHolds } = await releaseExpiredHolds(
			{ repo: inventoryHoldRepository },
			{ now: new Date() }
		)
		expect(releasedHolds).toBe(1)

		const d = await db
			.select()
			.from(DailyInventory)
			.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-10")))
			.get()
		expect(d?.reservedCount).toBe(0)

		const locks = await db
			.select()
			.from(InventoryLock)
			.where(eq(InventoryLock.holdId, holdId))
			.all()
		expect(locks.length).toBe(0)

		const ea = await db
			.select()
			.from(EffectiveAvailability)
			.where(
				and(
					eq(EffectiveAvailability.variantId, variantId),
					eq(EffectiveAvailability.date, "2026-03-10")
				)
			)
			.get()
		expect(Number((ea as any)?.heldUnits ?? 0)).toBe(0)
		expect(Number((ea as any)?.availableUnits ?? 0)).toBe(2)
	})
})
