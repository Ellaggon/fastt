import { describe, expect, it } from "vitest"

import { POST as setBaseRatePost } from "@/pages/api/pricing/base-rate"
import { GET as resolvePoliciesGet } from "@/pages/api/policies/resolve"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
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

function createCookiesStub() {
	const store = new Map<string, string>()
	return {
		get(name: string) {
			const value = store.get(name)
			return value == null ? undefined : { value }
		},
		set(name: string, value: string) {
			store.set(name, value)
		},
	}
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

describe("integration/ratePlan-first hardening e2e", () => {
	it("flujo canónico exige ratePlanId y mantiene consistencia en base-rate + policies-resolve", async () => {
		const suffix = crypto.randomUUID()
		const token = `t_rpf_hard_${suffix}`
		const email = `rpf-hard-${suffix}@example.com`
		const providerId = `prov_rpf_hard_${suffix}`
		const destinationId = `dest_rpf_hard_${suffix}`
		const productId = `prod_rpf_hard_${suffix}`
		const variantId = `var_rpf_hard_${suffix}`
		const ratePlanTemplateId = `rpt_rpf_hard_${suffix}`
		const ratePlanId = `rp_rpf_hard_${suffix}`

		await upsertDestination({
			id: destinationId,
			name: "RatePlan Hardening Dest",
			type: "city",
			country: "CL",
			slug: `rpf-hard-${suffix}`,
		})
		await upsertProvider({ id: providerId, displayName: "Provider Hardening", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Product Hardening",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Variant Hardening",
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

		await withSupabaseAuthStub({ [token]: { id: "u_rpf_hard", email } }, async () => {
			const invalidForm = new FormData()
			invalidForm.set("variantId", variantId)
			invalidForm.set("currency", "USD")
			invalidForm.set("basePrice", "120")
			const invalidBaseRateRes = await setBaseRatePost({
				request: makeAuthedFormRequest({
					path: "/api/pricing/base-rate",
					token,
					form: invalidForm,
				}),
			} as any)
			expect(invalidBaseRateRes.status).toBe(400)
			expect(await readJson(invalidBaseRateRes)).toEqual({ error: "ratePlanId_required" })

			const validForm = new FormData()
			validForm.set("ratePlanId", ratePlanId)
			validForm.set("currency", "USD")
			validForm.set("basePrice", "120")
			const validBaseRateRes = await setBaseRatePost({
				request: makeAuthedFormRequest({
					path: "/api/pricing/base-rate",
					token,
					form: validForm,
				}),
			} as any)
			expect(validBaseRateRes.status).toBe(200)

			const policiesOkRes = await resolvePoliciesGet({
				url: new URL(
					`http://localhost:4321/api/policies/resolve?ratePlanId=${encodeURIComponent(ratePlanId)}&checkIn=2031-06-10&checkOut=2031-06-12&channel=web`
				),
				cookies: createCookiesStub(),
			} as any)
			expect(policiesOkRes.status).toBe(200)
			const policiesOkBody = await readJson(policiesOkRes)
			expect(policiesOkBody?.ratePlanId).toBe(ratePlanId)
			expect(policiesOkBody?.variantId).toBe(variantId)

			const policiesInvalidRangeRes = await resolvePoliciesGet({
				url: new URL(
					`http://localhost:4321/api/policies/resolve?ratePlanId=${encodeURIComponent(ratePlanId)}&checkIn=2031-06-12&checkOut=2031-06-10&channel=web`
				),
				cookies: createCookiesStub(),
			} as any)
			expect(policiesInvalidRangeRes.status).toBe(400)
			expect(await readJson(policiesInvalidRangeRes)).toEqual({ error: "invalid_stay_range" })
		})
	})
})
