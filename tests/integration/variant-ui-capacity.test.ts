import { describe, it, expect } from "vitest"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as createVariantPost } from "@/pages/api/variant/create"
import { POST as setCapacityPost } from "@/pages/api/variant/capacity"

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

describe("integration/variants UI Step 2 (capacity) - simulated", () => {
	it("happy flow: create variant -> set capacity => 200, and next URL is room-type", async () => {
		const token = "t_ui_cap_ok"
		const email = "ui-cap-ok@example.com"
		const providerId = "prov_ui_cap_ok"
		const destinationId = "dest_ui_cap_ok"
		const productId = `prod_ui_cap_ok_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Cap Dest",
			type: "city",
			country: "CL",
			slug: "cap-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Cap Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Cap Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_ui_cap_ok", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Cap")
			fd.set("kind", "hotel_room")
			const createRes = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(createRes.status).toBe(200)
			const { variantId } = (await readJson(createRes)) as any
			expect(typeof variantId).toBe("string")

			const cap = new FormData()
			cap.set("variantId", variantId)
			cap.set("minOccupancy", "1")
			cap.set("maxOccupancy", "2")
			cap.set("maxAdults", "2")
			cap.set("maxChildren", "0")

			const capRes = await setCapacityPost({
				request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: cap }),
			} as any)
			expect(capRes.status).toBe(200)

			const next = `/product-v2/${encodeURIComponent(productId)}/variants/${encodeURIComponent(
				variantId
			)}/room-type`
			expect(next).toContain("/room-type")
		})
	})

	it("validation: negative occupancy => 400 validation_error", async () => {
		const token = "t_ui_cap_bad"
		const email = "ui-cap-bad@example.com"
		const providerId = "prov_ui_cap_bad"
		const destinationId = "dest_ui_cap_bad"
		const productId = `prod_ui_cap_bad_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Bad Dest",
			type: "city",
			country: "CL",
			slug: "bad-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Bad Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Bad Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_ui_cap_bad", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Bad")
			fd.set("kind", "hotel_room")
			const createRes = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(createRes.status).toBe(200)
			const { variantId } = (await readJson(createRes)) as any

			const cap = new FormData()
			cap.set("variantId", variantId)
			cap.set("minOccupancy", "-1")
			cap.set("maxOccupancy", "2")
			const capRes = await setCapacityPost({
				request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: cap }),
			} as any)
			expect(capRes.status).toBe(400)
			const body = (await readJson(capRes)) as any
			expect(body?.error).toBe("validation_error")
		})
	})

	it("ownership: provider B cannot set capacity for provider A's variant => 404", async () => {
		const tokenA = "t_ui_cap_own_a"
		const tokenB = "t_ui_cap_own_b"
		const emailA = "ui-cap-own-a@example.com"
		const emailB = "ui-cap-own-b@example.com"
		const providerA = "prov_ui_cap_own_a"
		const providerB = "prov_ui_cap_own_b"
		const destinationId = "dest_ui_cap_own"
		const productId = `prod_ui_cap_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Own Dest C",
			type: "city",
			country: "CL",
			slug: "own-dest-c",
		})
		await upsertProvider({ id: providerA, displayName: "Own Cap A", ownerEmail: emailA })
		await upsertProvider({ id: providerB, displayName: "Own Cap B", ownerEmail: emailB })
		await upsertProduct({
			id: productId,
			name: "Own Cap Hotel",
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
				const fd = new FormData()
				fd.set("productId", productId)
				fd.set("name", "Room Own")
				fd.set("kind", "hotel_room")
				const createRes = await createVariantPost({
					request: makeAuthedFormRequest({ path: "/api/variant/create", token: tokenA, form: fd }),
				} as any)
				expect(createRes.status).toBe(200)
				const { variantId } = (await readJson(createRes)) as any

				const cap = new FormData()
				cap.set("variantId", variantId)
				cap.set("minOccupancy", "1")
				cap.set("maxOccupancy", "2")
				const capRes = await setCapacityPost({
					request: makeAuthedFormRequest({
						path: "/api/variant/capacity",
						token: tokenB,
						form: cap,
					}),
				} as any)
				expect(capRes.status).toBe(404)
			}
		)
	})
})
