import { describe, it, expect } from "vitest"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as createVariantPost } from "@/pages/api/variant/create"
import { GET as listVariantsGet } from "@/pages/api/variant/list"

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

describe("integration/api/variant/list", () => {
	it("list variants OK (after creating one via API) => shape includes null capacity/subtype", async () => {
		const token = "t_list_ok"
		const email = "listok@example.com"
		const providerId = "prov_list_ok"
		const destinationId = "dest_list_ok"
		const productId = `prod_list_ok_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "List Dest",
			type: "city",
			country: "CL",
			slug: "list-dest",
		})
		await upsertProvider({ id: providerId, companyName: "List Provider", userEmail: email })
		await upsertProduct({
			id: productId,
			name: "List Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_list_ok", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room A")
			fd.set("kind", "hotel_room")

			const createRes = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(createRes.status).toBe(200)
			const { variantId } = (await readJson(createRes)) as any
			expect(typeof variantId).toBe("string")

			const listRes = await listVariantsGet({
				request: makeAuthedGetRequest({
					path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
					token,
				}),
			} as any)
			expect(listRes.status).toBe(200)
			const json = (await readJson(listRes)) as any
			expect(Array.isArray(json)).toBe(true)
			expect(json.length).toBe(1)
			expect(json[0]).toMatchObject({
				id: variantId,
				name: "Room A",
				kind: "hotel_room",
				status: "draft",
				capacity: null,
				subtype: null,
			})
		})
	})

	it("product without variants => []", async () => {
		const token = "t_list_empty"
		const email = "listempty@example.com"
		const providerId = "prov_list_empty"
		const destinationId = "dest_list_empty"
		const productId = `prod_list_empty_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Empty Dest",
			type: "city",
			country: "CL",
			slug: "empty-dest",
		})
		await upsertProvider({ id: providerId, companyName: "Empty Provider", userEmail: email })
		await upsertProduct({
			id: productId,
			name: "Empty Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_list_empty", email } }, async () => {
			const listRes = await listVariantsGet({
				request: makeAuthedGetRequest({
					path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
					token,
				}),
			} as any)
			expect(listRes.status).toBe(200)
			const json = (await readJson(listRes)) as any
			expect(json).toEqual([])
		})
	})

	it("ownership violation => 404", async () => {
		const tokenA = "t_list_own_a"
		const tokenB = "t_list_own_b"
		const emailA = "lista@example.com"
		const emailB = "listb@example.com"
		const providerA = "prov_list_own_a"
		const providerB = "prov_list_own_b"
		const destinationId = "dest_list_own"
		const productId = `prod_list_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Own Dest",
			type: "city",
			country: "CL",
			slug: "own-dest-l",
		})
		await upsertProvider({ id: providerA, companyName: "Own A", userEmail: emailA })
		await upsertProvider({ id: providerB, companyName: "Own B", userEmail: emailB })
		await upsertProduct({
			id: productId,
			name: "Own Hotel",
			productType: "Hotel",
			destinationId,
			providerId: providerA,
		})

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_oa", email: emailA },
				[tokenB]: { id: "u_ob", email: emailB },
			},
			async () => {
				const listRes = await listVariantsGet({
					request: makeAuthedGetRequest({
						path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
						token: tokenB,
					}),
				} as any)
				expect(listRes.status).toBe(404)
			}
		)
	})
})
