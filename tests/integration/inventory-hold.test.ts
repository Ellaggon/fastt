import { describe, it, expect } from "vitest"

import { db, DailyInventory, InventoryLock, Variant, eq, and } from "astro:db"

import { POST as holdPost } from "@/pages/api/inventory/hold"
import { POST as releasePost } from "@/pages/api/inventory/release"

import { InventoryHoldRepository } from "@/modules/inventory/infrastructure/repositories/InventoryHoldRepository"
import { releaseExpiredHolds } from "@/modules/inventory/public"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

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
		entityType: "hotel_room",
		entityId: params.variantId,
		name: "Room",
		description: null,
		kind: "hotel_room",
		status: "ready",
		createdAt: new Date(),
		isActive: true,
	} as any)

	for (const d of params.dates) {
		await db.insert(DailyInventory).values({
			id: crypto.randomUUID(),
			variantId: params.variantId,
			date: d,
			totalInventory: params.totalInventory,
			reservedCount: 0,
			priceOverride: null,
			createdAt: new Date(),
		} as any)
	}
}

describe("integration/inventory holds (InventoryLock)", () => {
	it("hold success increments reservedCount and inserts locks", async () => {
		const token = "t_hold_ok"
		const email = "hold-ok@example.com"
		const variantId = `var_hold_ok_${crypto.randomUUID()}`
		const productId = `prod_hold_ok_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			totalInventory: 2,
			dates: ["2026-03-10", "2026-03-11"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_ok", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
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
		})
	})

	it("hold fails when insufficient inventory; no rows modified", async () => {
		const token = "t_hold_fail"
		const email = "hold-fail@example.com"
		const variantId = `var_hold_fail_${crypto.randomUUID()}`
		const productId = `prod_hold_fail_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			totalInventory: 1,
			dates: ["2026-03-10", "2026-03-11"],
		})

		// Pre-reserve 1 on the second day so the range cannot fit quantity=1 across both days.
		await db
			.update(DailyInventory)
			.set({ reservedCount: 1 } as any)
			.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-11")))
			.run()

		await withSupabaseAuthStub({ [token]: { id: "u_hold_fail", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("checkIn", "2026-03-10")
			fd.set("checkOut", "2026-03-12")
			fd.set("quantity", "1")

			const res = await holdPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
			} as any)
			expect(res.status).toBe(400)
			const body = (await readJson(res)) as any
			expect(body?.error).toBe("not_available")

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

	it("concurrent safety: two holds race; only one succeeds", async () => {
		const token = "t_hold_race"
		const email = "hold-race@example.com"
		const variantId = `var_hold_race_${crypto.randomUUID()}`
		const productId = `prod_hold_race_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			totalInventory: 1,
			dates: ["2026-03-10"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_race", email } }, async () => {
			const mk = () => {
				const fd = new FormData()
				fd.set("variantId", variantId)
				fd.set("checkIn", "2026-03-10")
				fd.set("checkOut", "2026-03-11")
				fd.set("quantity", "1")
				return holdPost({
					request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: fd }),
				} as any)
			}

			const [r1, r2] = await Promise.all([mk(), mk()])
			const okCount = [r1.status, r2.status].filter((s) => s === 200).length
			const failCount = [r1.status, r2.status].filter((s) => s === 400).length
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

		await seedVariantWithInventory({
			variantId,
			productId,
			totalInventory: 2,
			dates: ["2026-03-10", "2026-03-11"],
		})

		await withSupabaseAuthStub({ [token]: { id: "u_hold_release", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
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
		})
	})

	it("expire holds: releaseExpiredHolds removes expired locks and restores reservedCount", async () => {
		const repo = new InventoryHoldRepository()
		const variantId = `var_hold_exp_${crypto.randomUUID()}`
		const productId = `prod_hold_exp_${crypto.randomUUID()}`

		await seedVariantWithInventory({
			variantId,
			productId,
			totalInventory: 2,
			dates: ["2026-03-10"],
		})

		const holdId = crypto.randomUUID()

		// Create an already-expired hold via the real repository (increments reservedCount + writes InventoryLock).
		const holdRes = await repo.holdInventory({
			holdId,
			variantId,
			checkIn: new Date("2026-03-10"),
			checkOut: new Date("2026-03-11"),
			quantity: 1,
			expiresAt: new Date(Date.now() - 60_000),
		})
		expect(holdRes.success).toBe(true)

		const { releasedHolds } = await releaseExpiredHolds({ repo }, { now: new Date() })
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
	})
})
