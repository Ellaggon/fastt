import { describe, it, expect } from "vitest"

import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider, upsertRoomType } from "../test-support/catalog-db-test-data"

import { POST as setBaseRatePost } from "@/pages/api/pricing/base-rate"
import { POST as createVariantPost } from "@/pages/api/variant/create"
import { POST as setCapacityPost } from "@/pages/api/variant/capacity"
import { POST as attachSubtypePost } from "@/pages/api/variant/subtype/hotel-room"
import { POST as evaluateVariantPost } from "@/pages/api/variant/evaluate"

import { and, asc, db, eq, RatePlanOccupancyPolicy } from "astro:db"

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

async function seedRatePlanFixture(params?: { ownerEmail?: string }) {
	const suffix = crypto.randomUUID()
	const ownerEmail = params?.ownerEmail ?? `br-${suffix}@example.com`
	const providerId = `prov_br_${suffix}`
	const destinationId = `dest_br_${suffix}`
	const productId = `prod_br_${suffix}`
	const variantId = `var_br_${suffix}`
	const ratePlanTemplateId = `rpt_br_${suffix}`
	const ratePlanId = `rp_br_${suffix}`

	await upsertDestination({
		id: destinationId,
		name: "BR Dest",
		type: "city",
		country: "CL",
		slug: `br-dest-${suffix}`,
	})
	await upsertProvider({ id: providerId, displayName: "BR Provider", ownerEmail })
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
		kind: "hotel_room",
		name: "Room",
		baseRateCurrency: "USD",
		baseRatePrice: 999,
	})
	await upsertRatePlanTemplate({
		id: ratePlanTemplateId,
		name: "Default",
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlan({
		id: ratePlanId,
		templateId: ratePlanTemplateId,
		variantId,
		isActive: true,
		isDefault: true,
	})

	return { ownerEmail, providerId, productId, variantId, ratePlanId }
}

describe("integration/pricing base rate (ratePlan-first)", () => {
	it("ratePlanId is required first (variantId-only is rejected)", async () => {
		const token = "t_br_required"
		const seeded = await seedRatePlanFixture({ ownerEmail: "br-required@example.com" })

		await withSupabaseAuthStub(
			{ [token]: { id: "u_br_required", email: seeded.ownerEmail } },
			async () => {
				const fd = new FormData()
				fd.set("variantId", seeded.variantId)
				fd.set("currency", "USD")
				fd.set("basePrice", "120")

				const res = await setBaseRatePost({
					request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: fd }),
				} as any)
				expect(res.status).toBe(400)
				expect(await readJson(res)).toEqual({ error: "ratePlanId_required" })
			}
		)
	})

	it("set base rate OK + overwrite (ratePlan-first)", async () => {
		const token = "t_br_ok"
		const seeded = await seedRatePlanFixture({ ownerEmail: "br-ok@example.com" })

		await withSupabaseAuthStub(
			{ [token]: { id: "u_br_ok", email: seeded.ownerEmail } },
			async () => {
				const fd = new FormData()
				fd.set("ratePlanId", seeded.ratePlanId)
				fd.set("currency", "USD")
				fd.set("basePrice", "120")

				const res = await setBaseRatePost({
					request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: fd }),
				} as any)
				expect(res.status).toBe(200)

				const row1 = await db
					.select({
						baseAmount: RatePlanOccupancyPolicy.baseAmount,
						baseCurrency: RatePlanOccupancyPolicy.baseCurrency,
					})
					.from(RatePlanOccupancyPolicy)
					.where(
						and(
							eq(RatePlanOccupancyPolicy.ratePlanId, seeded.ratePlanId),
							eq(RatePlanOccupancyPolicy.baseAdults, 2),
							eq(RatePlanOccupancyPolicy.baseChildren, 0)
						)
					)
					.orderBy(asc(RatePlanOccupancyPolicy.effectiveFrom), asc(RatePlanOccupancyPolicy.id))
					.get()
				expect(Number(row1?.baseAmount ?? 0)).toBe(120)
				expect(String(row1?.baseCurrency ?? "")).toBe("USD")

				const fd2 = new FormData()
				fd2.set("ratePlanId", seeded.ratePlanId)
				fd2.set("currency", "BOB")
				fd2.set("basePrice", "200")
				const res2 = await setBaseRatePost({
					request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: fd2 }),
				} as any)
				expect(res2.status).toBe(200)

				const row2 = await db
					.select({
						baseAmount: RatePlanOccupancyPolicy.baseAmount,
						baseCurrency: RatePlanOccupancyPolicy.baseCurrency,
					})
					.from(RatePlanOccupancyPolicy)
					.where(
						and(
							eq(RatePlanOccupancyPolicy.ratePlanId, seeded.ratePlanId),
							eq(RatePlanOccupancyPolicy.baseAdults, 2),
							eq(RatePlanOccupancyPolicy.baseChildren, 0)
						)
					)
					.orderBy(asc(RatePlanOccupancyPolicy.effectiveFrom), asc(RatePlanOccupancyPolicy.id))
					.get()
				expect(Number(row2?.baseAmount ?? 0)).toBe(200)
				expect(String(row2?.baseCurrency ?? "")).toBe("BOB")
			}
		)
	})

	it("invalid price => 400 validation_error", async () => {
		const token = "t_br_bad"
		const seeded = await seedRatePlanFixture({ ownerEmail: "br-bad@example.com" })

		await withSupabaseAuthStub(
			{ [token]: { id: "u_br_bad", email: seeded.ownerEmail } },
			async () => {
				const fd = new FormData()
				fd.set("ratePlanId", seeded.ratePlanId)
				fd.set("currency", "USD")
				fd.set("basePrice", "-1")

				const res = await setBaseRatePost({
					request: makeAuthedFormRequest({ path: "/api/pricing/base-rate", token, form: fd }),
				} as any)
				expect(res.status).toBe(400)
				const body = (await readJson(res)) as any
				expect(body?.error).toBe("validation_error")
			}
		)
	})

	it("ownership enforcement => 404", async () => {
		const tokenA = "t_br_own_a"
		const tokenB = "t_br_own_b"
		const seeded = await seedRatePlanFixture({ ownerEmail: "br-oa@example.com" })
		await upsertProvider({
			id: `prov_br_other_${crypto.randomUUID()}`,
			displayName: "BR Other Provider",
			ownerEmail: "br-ob@example.com",
		})

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_oa", email: seeded.ownerEmail },
				[tokenB]: { id: "u_ob", email: "br-ob@example.com" },
			},
			async () => {
				const fd = new FormData()
				fd.set("ratePlanId", seeded.ratePlanId)
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

			const ratePlanTemplateId = `rpt_br_ready_${crypto.randomUUID()}`
			const ratePlanId = `rp_br_ready_${crypto.randomUUID()}`
			await upsertRatePlanTemplate({
				id: ratePlanTemplateId,
				name: "Ready Default",
				paymentType: "prepaid",
				refundable: false,
			})
			await upsertRatePlan({
				id: ratePlanId,
				templateId: ratePlanTemplateId,
				variantId,
				isActive: true,
				isDefault: true,
			})

			const br = new FormData()
			br.set("ratePlanId", ratePlanId)
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
