import { describe, it, expect } from "vitest"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider, upsertRoomType } from "../test-support/catalog-db-test-data"

import { POST as setBaseRatePost } from "@/pages/api/pricing/base-rate"
import { POST as createVariantPost } from "@/pages/api/variant/create"
import { POST as setCapacityPost } from "@/pages/api/variant/capacity"
import { POST as attachSubtypePost } from "@/pages/api/variant/subtype/hotel-room"
import { POST as evaluateVariantPost } from "@/pages/api/variant/evaluate"

import { baseRateRepository, variantRepository, backfillPricingBaseRates } from "@/container"

import { db, PricingBaseRate, eq } from "astro:db"

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

describe("integration/pricing base rate (CAPA 4A)", () => {
	it("set base rate OK + overwrite", async () => {
		const token = "t_br_ok"
		const email = "br-ok@example.com"
		const providerId = "prov_br_ok"
		const destinationId = "dest_br_ok"
		const productId = `prod_br_ok_${crypto.randomUUID()}`
		const variantId = `var_br_ok_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BR Dest",
			type: "city",
			country: "CL",
			slug: "br-dest",
		})
		await upsertProvider({ id: providerId, displayName: "BR Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "BR Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: "hr_br_ok",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_br_ok", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("currency", "USD")
			fd.set("basePrice", "120")

			const res = await setBaseRatePost({
				request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)

			const row1 = await db
				.select()
				.from(PricingBaseRate)
				.where(eq(PricingBaseRate.variantId, variantId))
				.get()
			expect(row1?.basePrice).toBe(120)
			expect(row1?.currency).toBe("USD")

			const fd2 = new FormData()
			fd2.set("variantId", variantId)
			fd2.set("currency", "BOB")
			fd2.set("basePrice", "200")
			const res2 = await setBaseRatePost({
				request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: fd2 }),
			} as any)
			expect(res2.status).toBe(200)

			const row2 = await db
				.select()
				.from(PricingBaseRate)
				.where(eq(PricingBaseRate.variantId, variantId))
				.get()
			expect(row2?.basePrice).toBe(200)
			expect(row2?.currency).toBe("BOB")
		})
	})

	it("invalid price => 400 validation_error", async () => {
		const token = "t_br_bad"
		const email = "br-bad@example.com"
		const providerId = "prov_br_bad"
		const destinationId = "dest_br_bad"
		const productId = `prod_br_bad_${crypto.randomUUID()}`
		const variantId = `var_br_bad_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BR Bad Dest",
			type: "city",
			country: "CL",
			slug: "br-bad-dest",
		})
		await upsertProvider({ id: providerId, displayName: "BR Bad Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "BR Bad Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: "hr_br_bad",
			name: "Room",
			currency: "USD",
			basePrice: 10,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_br_bad", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			fd.set("currency", "USD")
			fd.set("basePrice", "-1")

			const res = await setBaseRatePost({
				request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: fd }),
			} as any)
			expect(res.status).toBe(400)
			const body = (await readJson(res)) as any
			expect(body?.error).toBe("validation_error")
		})
	})

	it("ownership violation => 404", async () => {
		const tokenA = "t_br_own_a"
		const tokenB = "t_br_own_b"
		const emailA = "br-oa@example.com"
		const emailB = "br-ob@example.com"
		const providerA = "prov_br_own_a"
		const providerB = "prov_br_own_b"
		const destinationId = "dest_br_own"
		const productId = `prod_br_own_${crypto.randomUUID()}`
		const variantId = `var_br_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BR Own Dest",
			type: "city",
			country: "CL",
			slug: "br-own-dest",
		})
		await upsertProvider({ id: providerA, displayName: "BR Own A", ownerEmail: emailA })
		await upsertProvider({ id: providerB, displayName: "BR Own B", ownerEmail: emailB })
		await upsertProduct({
			id: productId,
			name: "BR Own Hotel",
			productType: "Hotel",
			destinationId,
			providerId: providerA,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: "hr_br_own",
			name: "Room",
			currency: "USD",
			basePrice: 10,
		})

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_oa", email: emailA },
				[tokenB]: { id: "u_ob", email: emailB },
			},
			async () => {
				const fd = new FormData()
				fd.set("variantId", variantId)
				fd.set("currency", "USD")
				fd.set("basePrice", "99")

				const res = await setBaseRatePost({
					request: makeAuthedFormRequest({
						path: "/api/pricing/base-rate",
						token: tokenB,
						form: fd,
					}),
				} as any)
				expect(res.status).toBe(404)
			}
		)
	})

	it("backfill works and repository read prefers pricing_base_rate over Variant.basePrice", async () => {
		const destinationId = "dest_br_backfill"
		const providerId = "prov_br_backfill"
		const productId = `prod_br_backfill_${crypto.randomUUID()}`
		const variantId = `var_br_backfill_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BF Dest",
			type: "city",
			country: "CL",
			slug: "bf-dest",
		})
		await upsertProvider({
			id: providerId,
			displayName: "BF Provider",
			ownerEmail: "bf@example.com",
		})
		await upsertProduct({
			id: productId,
			name: "BF Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: "hr_bf",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})

		const r0 = await baseRateRepository.getByVariantId(variantId)
		expect(r0).toBeNull()

		const { processed } = await backfillPricingBaseRates()
		expect(processed).toBeGreaterThan(0)

		const r1 = await baseRateRepository.getByVariantId(variantId)
		expect(r1?.basePrice).toBe(999)

		// Overwrite base rate and ensure reads prefer it.
		await baseRateRepository.upsert({ variantId, currency: "USD", basePrice: 50 })
		const snap = await variantRepository.getById(variantId)
		expect(snap?.pricing.basePrice).toBe(50)
	})

	it("readiness removes pricing_missing when base rate exists", async () => {
		const token = "t_br_ready"
		const email = "br-ready@example.com"
		const providerId = "prov_br_ready"
		const destinationId = "dest_br_ready"
		const productId = `prod_br_ready_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Ready Dest",
			type: "city",
			country: "CL",
			slug: "ready-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Ready Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Ready Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertRoomType({ id: "rt_br_ready", name: "Double", maxOccupancy: 2 })

		await withSupabaseAuthStub({ [token]: { id: "u_br_ready", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Ready")
			fd.set("kind", "hotel_room")
			const createRes = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(createRes.status).toBe(200)
			const { variantId } = (await readJson(createRes)) as any

			const cap = new FormData()
			cap.set("variantId", variantId)
			cap.set("minOccupancy", "1")
			cap.set("maxOccupancy", "2")
			expect(
				(
					await setCapacityPost({
						request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: cap }),
					} as any)
				).status
			).toBe(200)

			const sub = new FormData()
			sub.set("variantId", variantId)
			sub.set("roomTypeId", "rt_br_ready")
			expect(
				(
					await attachSubtypePost({
						request: makeAuthedFormRequest({
							path: "/api/variant/subtype/hotel-room",
							token,
							form: sub,
						}),
					} as any)
				).status
			).toBe(200)

			// Set base rate
			const br = new FormData()
			br.set("variantId", variantId)
			br.set("currency", "USD")
			br.set("basePrice", "100")
			expect(
				(
					await setBaseRatePost({
						request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: br }),
					} as any)
				).status
			).toBe(200)

			const evalFd = new FormData()
			evalFd.set("variantId", variantId)
			const evalRes = await evaluateVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/evaluate", token, form: evalFd }),
			} as any)
			expect(evalRes.status).toBe(200)
			const ev = (await readJson(evalRes)) as any
			expect(ev.state).toBe("ready")
			expect(ev.validationErrors.some((e: any) => e.code === "pricing_missing")).toBe(false)
			expect(ev.validationErrors.some((e: any) => e.code === "inventory_missing")).toBe(true)
		})
	})
})
