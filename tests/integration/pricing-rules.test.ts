import { describe, it, expect } from "vitest"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as setBaseRatePost } from "@/pages/api/pricing/base-rate"
import { POST as createRulePost } from "@/pages/api/pricing/rule"
import { GET as listRulesGet } from "@/pages/api/pricing/rules"
import { POST as previewPost } from "@/pages/api/pricing/preview"

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

function makeAuthedFormRequest(params: { path: string; token?: string; form?: FormData }): Request {
	const headers = new Headers()
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: params.form,
		headers,
	})
}

function makeAuthedGetRequest(params: { path: string; token?: string }): Request {
	const headers = new Headers()
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, { method: "GET", headers })
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

describe("integration/pricing rules (CAPA 4D minimal)", () => {
	it("create rule OK + list rules OK + preview reflects rules", async () => {
		const token = "t_pr_rules_ok"
		const email = "rules-ok@example.com"
		const providerId = "prov_rules_ok"
		const destinationId = "dest_rules_ok"
		const productId = `prod_rules_ok_${crypto.randomUUID()}`
		const variantId = `var_rules_ok_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Rules Dest",
			type: "city",
			country: "CL",
			slug: "rules-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Rules Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Rules Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: "hr_rules_ok",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_rules_ok", email } }, async () => {
			// Base rate
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

			// Create rule
			const r = new FormData()
			r.set("variantId", variantId)
			r.set("type", "percentage")
			r.set("value", "10")
			const createRes = await createRulePost({
				request: makeAuthedFormRequest({ path: "/api/pricing/rule", token, form: r }),
			} as any)
			expect(createRes.status).toBe(201)

			// List rules (also ensures default plan exists)
			const listRes = await listRulesGet({
				request: makeAuthedGetRequest({
					path: `/api/pricing/rules?variantId=${encodeURIComponent(variantId)}`,
					token,
				}),
				url: new URL(
					`http://localhost:4321/api/pricing/rules?variantId=${encodeURIComponent(variantId)}`
				),
			} as any)
			expect(listRes.status).toBe(200)
			const listBody = (await readJson(listRes)) as any
			expect(Array.isArray(listBody?.rules)).toBe(true)
			expect(listBody.rules.length).toBeGreaterThanOrEqual(1)

			// Preview reflects rule
			const prevFd = new FormData()
			prevFd.set("variantId", variantId)
			const prevRes = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: prevFd }),
			} as any)
			expect(prevRes.status).toBe(200)
			const prevBody = (await readJson(prevRes)) as any
			expect(prevBody?.basePrice).toBe(100)
			expect(prevBody?.finalPrice).toBe(110)
		})
	})

	it("ownership violation => 404", async () => {
		const tokenA = "t_pr_rules_oa"
		const tokenB = "t_pr_rules_ob"
		const emailA = "rules-oa@example.com"
		const emailB = "rules-ob@example.com"
		const providerA = "prov_rules_oa"
		const providerB = "prov_rules_ob"
		const destinationId = "dest_rules_own"
		const productId = `prod_rules_own_${crypto.randomUUID()}`
		const variantId = `var_rules_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Rules Own Dest",
			type: "city",
			country: "CL",
			slug: "rules-own-dest",
		})
		await upsertProvider({ id: providerA, displayName: "Rules Own A", ownerEmail: emailA })
		await upsertProvider({ id: providerB, displayName: "Rules Own B", ownerEmail: emailB })
		await upsertProduct({
			id: productId,
			name: "Rules Own Hotel",
			productType: "Hotel",
			destinationId,
			providerId: providerA,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: "hr_rules_own",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_rules_oa", email: emailA },
				[tokenB]: { id: "u_rules_ob", email: emailB },
			},
			async () => {
				const r = new FormData()
				r.set("variantId", variantId)
				r.set("type", "percentage")
				r.set("value", "10")

				const res = await createRulePost({
					request: makeAuthedFormRequest({ path: "/api/pricing/rule", token: tokenB, form: r }),
				} as any)
				expect(res.status).toBe(404)
			}
		)
	})
})
