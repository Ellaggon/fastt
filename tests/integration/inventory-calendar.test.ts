import { describe, it, expect } from "vitest"

import { db, DailyInventory, eq, and } from "astro:db"

import { GET as calendarGet } from "@/pages/api/inventory/calendar"
import { POST as bulkPost } from "@/pages/api/inventory/bulk-update"
import { POST as dayPost } from "@/pages/api/inventory/update-day"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

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

function makeAuthedRequest(params: {
	method: "GET" | "POST"
	path: string
	token?: string
	body?: BodyInit
}) {
	const headers = new Headers()
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: params.method,
		body: params.body,
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

async function seedVariantOwnedByProvider(params: {
	email: string
	providerId: string
	productId: string
	variantId: string
}) {
	const destinationId = `dest_inv_${crypto.randomUUID()}`
	await upsertDestination({
		id: destinationId,
		name: "Dest",
		type: "city",
		country: "CL",
		slug: `dest-${destinationId}`,
	})
	await upsertProvider({ id: params.providerId, displayName: "Prov", ownerEmail: params.email })
	await upsertProduct({
		id: params.productId,
		name: "Hotel",
		productType: "Hotel",
		destinationId,
		providerId: params.providerId,
	})
	await upsertVariant({
		id: params.variantId,
		productId: params.productId,
		entityType: "hotel_room",
		entityId: "hr",
		name: "Room",
		currency: "USD",
		basePrice: 999,
	})
}

describe("integration/inventory calendar API", () => {
	it("calendar returns full range; missing days are synthesized as unavailable", async () => {
		const token = "t_inv_cal_1"
		const email = "inv-cal@example.com"
		const providerId = "prov_inv_cal"
		const productId = `prod_inv_cal_${crypto.randomUUID()}`
		const variantId = `var_inv_cal_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({ email, providerId, productId, variantId })

		// Only insert one day; second day should be synthesized.
		await db.insert(DailyInventory).values({
			id: `di_${crypto.randomUUID()}`,
			variantId,
			date: "2026-03-10",
			totalInventory: 2,
			reservedCount: 0,
			priceOverride: null,
			stopSell: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)

		await withSupabaseAuthStub({ [token]: { id: "u1", email } }, async () => {
			const res = await calendarGet({
				request: makeAuthedRequest({
					method: "GET",
					path: `/api/inventory/calendar?variantId=${encodeURIComponent(variantId)}&startDate=2026-03-10&endDate=2026-03-12`,
					token,
				}),
			} as any)

			expect(res.status).toBe(200)
			const json = (await readJson(res)) as any[]
			expect(Array.isArray(json)).toBe(true)
			expect(json.length).toBe(2)

			expect(json[0].date).toBe("2026-03-10")
			expect(json[0].totalInventory).toBe(2)
			expect(json[0].available).toBe(2)
			expect(json[0].stopSell).toBe(false)

			expect(json[1].date).toBe("2026-03-11")
			expect(json[1].totalInventory).toBe(0)
			expect(json[1].available).toBe(0)
			expect(json[1].stopSell).toBe(true)
		})
	})

	it("bulk update upserts days and does NOT overwrite reservedCount", async () => {
		const token = "t_inv_bulk"
		const email = "inv-bulk@example.com"
		const providerId = "prov_inv_bulk"
		const productId = `prod_inv_bulk_${crypto.randomUUID()}`
		const variantId = `var_inv_bulk_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({ email, providerId, productId, variantId })

		// Seed a day with reservedCount=1
		await db.insert(DailyInventory).values({
			id: `di_${crypto.randomUUID()}`,
			variantId,
			date: "2026-03-10",
			totalInventory: 2,
			reservedCount: 1,
			priceOverride: null,
			stopSell: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)

		await withSupabaseAuthStub({ [token]: { id: "u2", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("startDate", "2026-03-10")
			fd.set("endDate", "2026-03-12")
			fd.set("totalInventory", "5")
			fd.set("stopSell", "false")

			const res = await bulkPost({
				request: makeAuthedRequest({
					method: "POST",
					path: "/api/inventory/bulk-update",
					token,
					body: fd,
				}),
			} as any)
			expect(res.status).toBe(200)

			const row = await db
				.select()
				.from(DailyInventory)
				.where(and(eq(DailyInventory.variantId, variantId), eq(DailyInventory.date, "2026-03-10")))
				.get()
			expect(Number((row as any)?.reservedCount)).toBe(1) // unchanged
			expect(Number((row as any)?.totalInventory)).toBe(5)
			expect(Boolean((row as any)?.stopSell ?? false)).toBe(false)
		})
	})

	it("stopSell blocks availability; reopen restores availability when stock exists", async () => {
		const token = "t_inv_stop"
		const email = "inv-stop@example.com"
		const providerId = "prov_inv_stop"
		const productId = `prod_inv_stop_${crypto.randomUUID()}`
		const variantId = `var_inv_stop_${crypto.randomUUID()}`

		await seedVariantOwnedByProvider({ email, providerId, productId, variantId })

		await db.insert(DailyInventory).values({
			id: `di_${crypto.randomUUID()}`,
			variantId,
			date: "2026-03-10",
			totalInventory: 2,
			reservedCount: 0,
			priceOverride: null,
			stopSell: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as any)

		await withSupabaseAuthStub({ [token]: { id: "u3", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("date", "2026-03-10")
			fd.set("stopSell", "true")

			const closeRes = await dayPost({
				request: makeAuthedRequest({
					method: "POST",
					path: "/api/inventory/update-day",
					token,
					body: fd,
				}),
			} as any)
			expect(closeRes.status).toBe(200)

			const cal1 = await calendarGet({
				request: makeAuthedRequest({
					method: "GET",
					path: `/api/inventory/calendar?variantId=${encodeURIComponent(variantId)}&startDate=2026-03-10&endDate=2026-03-11`,
					token,
				}),
			} as any)
			const json1 = (await readJson(cal1)) as any[]
			expect(json1[0].stopSell).toBe(true)
			expect(json1[0].available).toBe(0)

			const reopen = new FormData()
			reopen.set("variantId", variantId)
			reopen.set("startDate", "2026-03-10")
			reopen.set("endDate", "2026-03-11")
			reopen.set("stopSell", "false")
			const openRes = await bulkPost({
				request: makeAuthedRequest({
					method: "POST",
					path: "/api/inventory/bulk-update",
					token,
					body: reopen,
				}),
			} as any)
			expect(openRes.status).toBe(200)

			const cal2 = await calendarGet({
				request: makeAuthedRequest({
					method: "GET",
					path: `/api/inventory/calendar?variantId=${encodeURIComponent(variantId)}&startDate=2026-03-10&endDate=2026-03-11`,
					token,
				}),
			} as any)
			const json2 = (await readJson(cal2)) as any[]
			expect(json2[0].stopSell).toBe(false)
			expect(json2[0].available).toBe(2)
		})
	})
})
