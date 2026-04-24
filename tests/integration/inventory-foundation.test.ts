import { describe, it, expect } from "vitest"

import {
	and,
	db,
	DailyInventory,
	EffectiveAvailability,
	eq,
	gte,
	lt,
	VariantInventoryConfig,
	Variant,
} from "astro:db"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as createVariantPost } from "@/pages/api/variant/create"
import { POST as setDefaultInventoryPost } from "@/pages/api/inventory/set-default"
import { recomputeEffectiveAvailabilityRange } from "@/modules/inventory/public"

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

describe("CAPA 5 / Phase 1 inventory foundation", () => {
	it("Variant creation bootstraps inventory config + DailyInventory rows", async () => {
		const token = "t_inv_boot"
		const email = "inv-boot@example.com"
		const providerId = "prov_inv_boot"
		const destinationId = "dest_inv_boot"
		const productId = `prod_inv_boot_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Inv Dest",
			type: "city",
			country: "CL",
			slug: "inv-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Inv Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Inv Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_inv_boot", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Inv")
			fd.set("kind", "hotel_room")

			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const json = (await readJson(res)) as any
			const variantId = String(json?.variantId || "").trim()
			expect(variantId).toBeTruthy()

			const cfg = await db
				.select()
				.from(VariantInventoryConfig)
				.where(eq(VariantInventoryConfig.variantId, variantId))
				.get()
			expect(cfg?.defaultTotalUnits).toBe(1)

			const anyRow = await db
				.select({ id: DailyInventory.id })
				.from(DailyInventory)
				.where(eq(DailyInventory.variantId, variantId))
				.get()
			expect(anyRow).toBeTruthy()
		})
	})

	it("recomputeEffectiveAvailabilityRange materializes full date range (missing dates synthesized as unavailable)", async () => {
		const destinationId = "dest_inv_range"
		const providerId = "prov_inv_range"
		const productId = `prod_inv_range_${crypto.randomUUID()}`
		const variantId = `var_inv_range_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Range Dest",
			type: "city",
			country: "CL",
			slug: "range-dest",
		})
		await upsertProvider({
			id: providerId,
			displayName: "Range Provider",
			ownerEmail: "range@example.com",
		})
		await upsertProduct({
			id: productId,
			name: "Range Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await db.insert(Variant).values({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Range Room",
			description: null,
			status: "draft",
			createdAt: new Date(),
			isActive: false,
		} as any)

		// Only insert one day; range spans 3 nights.
		await db.insert(DailyInventory).values({
			id: crypto.randomUUID(),
			variantId,
			date: "2026-03-10",
			totalInventory: 5,
			reservedCount: 0,
			createdAt: new Date(),
		} as any)

		await recomputeEffectiveAvailabilityRange({
			variantId,
			from: "2026-03-10",
			to: "2026-03-13",
			reason: "integration_test",
		})

		const rows = await db
			.select()
			.from(EffectiveAvailability)
			.where(
				and(
					eq(EffectiveAvailability.variantId, variantId),
					gte(EffectiveAvailability.date, "2026-03-10"),
					lt(EffectiveAvailability.date, "2026-03-13")
				)
			)
			.all()
		expect(rows.length).toBe(3)

		const byDate = new Map(rows.map((r: any) => [String(r.date), r]))
		expect(byDate.get("2026-03-10")?.totalUnits).toBe(5)
		expect(byDate.get("2026-03-11")?.totalUnits).toBe(0)
		expect(byDate.get("2026-03-12")?.totalUnits).toBe(0)
		expect(byDate.get("2026-03-11")?.stopSell).toBe(true)
	})

	it("inventory/set-default creates config + inventory for variants missing DailyInventory", async () => {
		const destinationId = "dest_inv_backfill"
		const providerId = "prov_inv_backfill"
		const productId = `prod_inv_backfill_${crypto.randomUUID()}`
		const variantId = `var_inv_backfill_${crypto.randomUUID()}`
		const token = "t_inv_backfill"
		const email = "backfill@example.com"

		await upsertDestination({
			id: destinationId,
			name: "Backfill Dest",
			type: "city",
			country: "CL",
			slug: "backfill-dest",
		})
		await upsertProvider({
			id: providerId,
			displayName: "Backfill Provider",
			ownerEmail: email,
		})
		await upsertProduct({
			id: productId,
			name: "Backfill Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await db.insert(Variant).values({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Backfill Room",
			description: null,
			status: "draft",
			createdAt: new Date(),
			isActive: false,
		} as any)

		// Ensure no DailyInventory exists
		expect(
			await db
				.select({ id: DailyInventory.id })
				.from(DailyInventory)
				.where(eq(DailyInventory.variantId, variantId))
				.get()
		).toBeFalsy()

		await withSupabaseAuthStub({ [token]: { id: "u_inv_backfill", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("totalUnits", "1")
			fd.set("horizonDays", "3")

			const res = await setDefaultInventoryPost({
				request: makeAuthedFormRequest({ path: "/api/inventory/set-default", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
		})

		const cfg = await db
			.select()
			.from(VariantInventoryConfig)
			.where(eq(VariantInventoryConfig.variantId, variantId))
			.get()
		expect(cfg?.defaultTotalUnits).toBe(1)

		const anyRow = await db
			.select({ id: DailyInventory.id })
			.from(DailyInventory)
			.where(eq(DailyInventory.variantId, variantId))
			.get()
		expect(anyRow).toBeTruthy()
	})
})
