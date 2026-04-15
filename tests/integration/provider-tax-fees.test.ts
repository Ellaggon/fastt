import { describe, it, expect } from "vitest"

import { upsertProvider } from "../test-support/catalog-db-test-data"
import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlan,
	upsertRatePlanTemplate,
} from "@/shared/infrastructure/test-support/db-test-data"

import { POST as createDefinitionPost } from "@/pages/api/provider/tax-fees/definitions"
import { POST as assignPost } from "@/pages/api/provider/tax-fees/assignments"
import { POST as previewPost } from "@/pages/api/provider/tax-fees/preview"

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

describe("integration/provider tax-fees API", () => {
	it("rejects cross-provider assignment", async () => {
		const tokenA = "t_a"
		const tokenB = "t_b"
		const emailA = "prov-a@example.com"
		const emailB = "prov-b@example.com"
		const providerA = "prov_a"
		const providerB = "prov_b"
		const destinationId = "dest_a"
		const productId = "prod_a"
		const variantId = "var_a"
		const templateId = "rpt_a"
		const ratePlanId = "rp_a"

		await upsertProvider({ id: providerA, displayName: "ProvA", ownerEmail: emailA })
		await upsertProvider({ id: providerB, displayName: "ProvB", ownerEmail: emailB })
		await upsertDestination({
			id: destinationId,
			name: "Dest",
			type: "city",
			country: "CL",
			slug: "dest",
		})
		await upsertProduct({
			id: productId,
			name: "Hotel",
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
			basePrice: 100,
		})
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_a", email: emailA },
				[tokenB]: { id: "u_b", email: emailB },
			},
			async () => {
				const fd = new FormData()
				fd.set("code", "VAT")
				fd.set("name", "VAT")
				fd.set("kind", "tax")
				fd.set("calculationType", "percentage")
				fd.set("value", "10")
				fd.set("inclusionType", "excluded")
				fd.set("appliesPer", "stay")
				const defRes = await createDefinitionPost({
					request: makeAuthedFormRequest({
						path: "/api/provider/tax-fees/definitions",
						token: tokenA,
						form: fd,
					}),
				} as any)
				const defBody = await readJson(defRes)
				const definitionId = defBody?.id

				const assign = new FormData()
				assign.set("taxFeeDefinitionId", definitionId)
				assign.set("scope", "product")
				assign.set("scopeId", productId)

				const res = await assignPost({
					request: makeAuthedFormRequest({
						path: "/api/provider/tax-fees/assignments",
						token: tokenB,
						form: assign,
					}),
				} as any)
				expect(res.status).toBe(404)
			}
		)
	})

	it("rejects invalid scope", async () => {
		const token = "t_scope"
		const email = "scope@example.com"
		const providerId = "prov_scope"
		await upsertProvider({ id: providerId, displayName: "Prov", ownerEmail: email })

		await withSupabaseAuthStub({ [token]: { id: "u_scope", email } }, async () => {
			const fd = new FormData()
			fd.set("taxFeeDefinitionId", "def_x")
			fd.set("scope", "global")
			fd.set("scopeId", "global")

			const res = await assignPost({
				request: makeAuthedFormRequest({
					path: "/api/provider/tax-fees/assignments",
					token,
					form: fd,
				}),
			} as any)
			expect(res.status).toBe(400)
		})
	})

	it("returns preview breakdown for provider product", async () => {
		const token = "t_preview"
		const email = "preview@example.com"
		const providerId = "prov_preview"
		const destinationId = "dest_preview"
		const productId = "prod_preview"
		const variantId = "var_preview"
		const templateId = "rpt_preview"
		const ratePlanId = "rp_preview"

		await upsertProvider({ id: providerId, displayName: "Prov", ownerEmail: email })
		await upsertDestination({
			id: destinationId,
			name: "Dest",
			type: "city",
			country: "CL",
			slug: "dest-preview",
		})
		await upsertProduct({
			id: productId,
			name: "Hotel",
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
			basePrice: 100,
		})
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })

		await withSupabaseAuthStub({ [token]: { id: "u_preview", email } }, async () => {
			const def = new FormData()
			const code = `VAT_${crypto.randomUUID().slice(0, 8).toUpperCase()}`
			def.set("code", code)
			def.set("name", `VAT Preview ${code}`)
			def.set("kind", "tax")
			def.set("calculationType", "percentage")
			def.set("value", "10")
			def.set("inclusionType", "excluded")
			def.set("appliesPer", "stay")

			const defRes = await createDefinitionPost({
				request: makeAuthedFormRequest({
					path: "/api/provider/tax-fees/definitions",
					token,
					form: def,
				}),
			} as any)
			const defBody = await readJson(defRes)

			const assign = new FormData()
			assign.set("taxFeeDefinitionId", defBody.id)
			assign.set("scope", "product")
			assign.set("scopeId", productId)
			await assignPost({
				request: makeAuthedFormRequest({
					path: "/api/provider/tax-fees/assignments",
					token,
					form: assign,
				}),
			} as any)

			const prev = new FormData()
			prev.set("productId", productId)
			prev.set("checkIn", "2026-03-10")
			prev.set("checkOut", "2026-03-11")
			prev.set("base", "100")
			prev.set("guests", "2")

			const res = await previewPost({
				request: makeAuthedFormRequest({
					path: "/api/provider/tax-fees/preview",
					token,
					form: prev,
				}),
			} as any)

			expect(res.status).toBe(200)
			const body = await readJson(res)
			expect(body.breakdown.total).toBe(110)
			expect(body.breakdown.taxes.excluded[0].amount).toBe(10)
		})
	})
})
