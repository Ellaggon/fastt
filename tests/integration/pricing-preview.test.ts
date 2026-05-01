import { describe, it, expect } from "vitest"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
	upsertPriceRule,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as previewPost } from "@/pages/api/pricing/preview"

import { baseRateRepository } from "@/container"

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

describe("integration/pricing preview (CAPA 4B minimal)", () => {
	it("compute price with no rate plans/rules => final = base", async () => {
		const token = "t_prev_base"
		const email = "prev-base@example.com"
		const providerId = "prov_prev_base"
		const destinationId = "dest_prev_base"
		const productId = `prod_prev_base_${crypto.randomUUID()}`
		const variantId = `var_prev_base_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev Dest",
			type: "city",
			country: "CL",
			slug: "prev-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Prev Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Prev Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_base", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)

			const res = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const body = (await readJson(res)) as any
			expect(body?.basePrice).toBe(100)
			expect(body?.finalPrice).toBe(100)
			expect(body?.currency).toBe("USD")
		})
	})

	it("no default rate plan => returns basePrice unchanged (no silent fallback)", async () => {
		const token = "t_prev_nodef"
		const email = "prev-nodef@example.com"
		const providerId = "prov_prev_nodef"
		const destinationId = "dest_prev_nodef"
		const productId = `prod_prev_nodef_${crypto.randomUUID()}`
		const variantId = `var_prev_nodef_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev NoDef Dest",
			type: "city",
			country: "CL",
			slug: "prev-nodef-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Prev NoDef Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Prev NoDef Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		// Create a plan + rule but NOT marked as default.
		const templateId = `rpt_prev_nodef_${crypto.randomUUID()}`
		const ratePlanId = `rp_prev_nodef_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Non-default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId,
			variantId,
			isActive: true,
			isDefault: false,
		})
		await upsertPriceRule({
			id: `pr_prev_nodef_${crypto.randomUUID()}`,
			ratePlanId,
			type: "percentage",
			value: 10,
			isActive: true,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_nodef", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)

			const res = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const body = (await readJson(res)) as any
			expect(body?.basePrice).toBe(100)
			expect(body?.finalPrice).toBe(100)
		})
	})

	it("compute price with percentage rule", async () => {
		const token = "t_prev_pct"
		const email = "prev-pct@example.com"
		const providerId = "prov_prev_pct"
		const destinationId = "dest_prev_pct"
		const productId = `prod_prev_pct_${crypto.randomUUID()}`
		const variantId = `var_prev_pct_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev Pct Dest",
			type: "city",
			country: "CL",
			slug: "prev-pct-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Prev Pct Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Prev Pct Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		const templateId = `rpt_prev_pct_${crypto.randomUUID()}`
		const ratePlanId = `rp_prev_pct_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })
		await upsertPriceRule({
			id: `pr_prev_pct_${crypto.randomUUID()}`,
			ratePlanId,
			type: "percentage",
			value: 10,
			isActive: true,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_pct", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)

			const res = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const body = (await readJson(res)) as any
			expect(body?.basePrice).toBe(100)
			expect(body?.finalPrice).toBe(110)
		})
	})

	it("multiple rules apply in deterministic createdAt ASC order (fixed then percentage)", async () => {
		const token = "t_prev_order"
		const email = "prev-order@example.com"
		const providerId = "prov_prev_order"
		const destinationId = "dest_prev_order"
		const productId = `prod_prev_order_${crypto.randomUUID()}`
		const variantId = `var_prev_order_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev Order Dest",
			type: "city",
			country: "CL",
			slug: "prev-order-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Prev Order Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Prev Order Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		const templateId = `rpt_prev_order_${crypto.randomUUID()}`
		const ratePlanId = `rp_prev_order_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })

		const t1 = new Date("2026-03-01T00:00:00.000Z")
		const t2 = new Date("2026-03-02T00:00:00.000Z")

		await upsertPriceRule({
			id: `pr_prev_order_a_${crypto.randomUUID()}`,
			ratePlanId,
			type: "fixed",
			value: 50,
			isActive: true,
			createdAt: t1,
		})
		await upsertPriceRule({
			id: `pr_prev_order_b_${crypto.randomUUID()}`,
			ratePlanId,
			type: "percentage",
			value: 10,
			isActive: true,
			createdAt: t2,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_order", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)

			const res = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const body = (await readJson(res)) as any
			expect(body?.basePrice).toBe(100)
			// fixed(50) then +10% => 55
			expect(body?.finalPrice).toBe(55)
		})
	})

	it("negative percentage rule is allowed (discount)", async () => {
		const token = "t_prev_negpct"
		const email = "prev-negpct@example.com"
		const providerId = "prov_prev_negpct"
		const destinationId = "dest_prev_negpct"
		const productId = `prod_prev_negpct_${crypto.randomUUID()}`
		const variantId = `var_prev_negpct_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev Neg Dest",
			type: "city",
			country: "CL",
			slug: "prev-neg-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Prev Neg Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Prev Neg Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		const templateId = `rpt_prev_negpct_${crypto.randomUUID()}`
		const ratePlanId = `rp_prev_negpct_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })
		await upsertPriceRule({
			id: `pr_prev_negpct_${crypto.randomUUID()}`,
			ratePlanId,
			type: "percentage",
			value: -10,
			isActive: true,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_negpct", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)

			const res = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const body = (await readJson(res)) as any
			expect(body?.finalPrice).toBe(90)
		})
	})

	it("unsupported rule type => 400 validation_error", async () => {
		const token = "t_prev_badtype"
		const email = "prev-badtype@example.com"
		const providerId = "prov_prev_badtype"
		const destinationId = "dest_prev_badtype"
		const productId = `prod_prev_badtype_${crypto.randomUUID()}`
		const variantId = `var_prev_badtype_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev BadType Dest",
			type: "city",
			country: "CL",
			slug: "prev-badtype-dest",
		})
		await upsertProvider({
			id: providerId,
			displayName: "Prev BadType Provider",
			ownerEmail: email,
		})
		await upsertProduct({
			id: productId,
			name: "Prev BadType Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		const templateId = `rpt_prev_badtype_${crypto.randomUUID()}`
		const ratePlanId = `rp_prev_badtype_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })
		await upsertPriceRule({
			id: `pr_prev_badtype_${crypto.randomUUID()}`,
			ratePlanId,
			type: "modifier",
			value: 10,
			isActive: true,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_badtype", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)
			const res = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(res.status).toBe(400)
			const body = (await readJson(res)) as any
			expect(body?.error).toBe("validation_error")
		})
	})

	it("compute price with fixed rule (override)", async () => {
		const token = "t_prev_fixed"
		const email = "prev-fixed@example.com"
		const providerId = "prov_prev_fixed"
		const destinationId = "dest_prev_fixed"
		const productId = `prod_prev_fixed_${crypto.randomUUID()}`
		const variantId = `var_prev_fixed_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev Fix Dest",
			type: "city",
			country: "CL",
			slug: "prev-fix-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Prev Fix Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Prev Fix Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		const templateId = `rpt_prev_fixed_${crypto.randomUUID()}`
		const ratePlanId = `rp_prev_fixed_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })
		await upsertPriceRule({
			id: `pr_prev_fixed_${crypto.randomUUID()}`,
			ratePlanId,
			type: "fixed",
			value: 80,
			isActive: true,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_fixed", email } }, async () => {
			const fd = new FormData()
			fd.set("variantId", variantId)

			const res = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const body = (await readJson(res)) as any
			expect(body?.basePrice).toBe(100)
			expect(body?.finalPrice).toBe(80)
		})
	})

	it("ownership violation => 404", async () => {
		const tokenA = "t_prev_own_a"
		const tokenB = "t_prev_own_b"
		const emailA = "prev-oa@example.com"
		const emailB = "prev-ob@example.com"
		const providerA = "prov_prev_own_a"
		const providerB = "prov_prev_own_b"
		const destinationId = "dest_prev_own"
		const productId = `prod_prev_own_${crypto.randomUUID()}`
		const variantId = `var_prev_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Prev Own Dest",
			type: "city",
			country: "CL",
			slug: "prev-own-dest",
		})
		await upsertProvider({ id: providerA, displayName: "Prev Own A", ownerEmail: emailA })
		await upsertProvider({ id: providerB, displayName: "Prev Own B", ownerEmail: emailB })
		await upsertProduct({
			id: productId,
			name: "Prev Own Hotel",
			productType: "Hotel",
			destinationId,
			providerId: providerA,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})
		await baseRateRepository.setCanonicalBaseForVariant({
			variantId,
			currency: "USD",
			basePrice: 100,
		})

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_prev_oa", email: emailA },
				[tokenB]: { id: "u_prev_ob", email: emailB },
			},
			async () => {
				const fd = new FormData()
				fd.set("variantId", variantId)

				const res = await previewPost({
					request: makeAuthedFormRequest({ path: "/api/pricing/preview", token: tokenB, form: fd }),
				} as any)
				expect(res.status).toBe(404)
			}
		)
	})
})
