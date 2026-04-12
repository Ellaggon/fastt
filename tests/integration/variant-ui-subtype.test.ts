import { describe, it, expect } from "vitest"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider, upsertRoomType } from "../test-support/catalog-db-test-data"

import { POST as createVariantPost } from "@/pages/api/variant/create"
import { POST as setCapacityPost } from "@/pages/api/variant/capacity"
import { POST as attachSubtypePost } from "@/pages/api/variant/subtype/hotel-room"

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
	try {
		return txt ? JSON.parse(txt) : null
	} catch {
		return { _raw: txt }
	}
}

describe("integration/variants UI Step 3 (subtype room type) - simulated", () => {
	it("happy flow: create -> capacity -> subtype => 200 and next URL is /review", async () => {
		const token = "t_ui_sub_ok"
		const email = "ui-sub-ok@example.com"
		const providerId = "prov_ui_sub_ok"
		const destinationId = "dest_ui_sub_ok"
		const productId = `prod_ui_sub_ok_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Sub Dest",
			type: "city",
			country: "CL",
			slug: "sub-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Sub Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Sub Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertRoomType({ id: "rt_ui_sub_ok", name: "Double", maxOccupancy: 2 })

		await withSupabaseAuthStub({ [token]: { id: "u_ui_sub_ok", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Sub")
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
			sub.set("roomTypeId", "rt_ui_sub_ok")
			const subRes = await attachSubtypePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/subtype/hotel-room",
					token,
					form: sub,
				}),
			} as any)
			expect(subRes.status).toBe(200)

			const next = `/product/${encodeURIComponent(productId)}/variants/${encodeURIComponent(
				variantId
			)}/review`
			expect(next).toContain("/review")
		})
	})

	it("duplicate subtype attach => 400", async () => {
		const token = "t_ui_sub_dup"
		const email = "ui-sub-dup@example.com"
		const providerId = "prov_ui_sub_dup"
		const destinationId = "dest_ui_sub_dup"
		const productId = `prod_ui_sub_dup_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Dup Dest",
			type: "city",
			country: "CL",
			slug: "dup-sub-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Dup Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Dup Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertRoomType({ id: "rt_ui_sub_dup", name: "Suite", maxOccupancy: 3 })

		await withSupabaseAuthStub({ [token]: { id: "u_ui_sub_dup", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Dup")
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
			sub.set("roomTypeId", "rt_ui_sub_dup")
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

			const sub2 = new FormData()
			sub2.set("variantId", variantId)
			sub2.set("roomTypeId", "rt_ui_sub_dup")
			const res2 = await attachSubtypePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/subtype/hotel-room",
					token,
					form: sub2,
				}),
			} as any)
			expect(res2.status).toBe(400)
		})
	})

	it("ownership: provider B cannot attach subtype => 404", async () => {
		const tokenA = "t_ui_sub_own_a"
		const tokenB = "t_ui_sub_own_b"
		const emailA = "ui-sub-own-a@example.com"
		const emailB = "ui-sub-own-b@example.com"
		const providerA = "prov_ui_sub_own_a"
		const providerB = "prov_ui_sub_own_b"
		const destinationId = "dest_ui_sub_own"
		const productId = `prod_ui_sub_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Own Dest",
			type: "city",
			country: "CL",
			slug: "own-sub-dest",
		})
		await upsertProvider({ id: providerA, displayName: "Own A", ownerEmail: emailA })
		await upsertProvider({ id: providerB, displayName: "Own B", ownerEmail: emailB })
		await upsertProduct({
			id: productId,
			name: "Own Hotel",
			productType: "Hotel",
			destinationId,
			providerId: providerA,
		})
		await upsertRoomType({ id: "rt_ui_sub_own", name: "Single", maxOccupancy: 1 })

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
				cap.set("maxOccupancy", "1")
				expect(
					(
						await setCapacityPost({
							request: makeAuthedFormRequest({
								path: "/api/variant/capacity",
								token: tokenA,
								form: cap,
							}),
						} as any)
					).status
				).toBe(200)

				const sub = new FormData()
				sub.set("variantId", variantId)
				sub.set("roomTypeId", "rt_ui_sub_own")
				const resB = await attachSubtypePost({
					request: makeAuthedFormRequest({
						path: "/api/variant/subtype/hotel-room",
						token: tokenB,
						form: sub,
					}),
				} as any)
				expect(resB.status).toBe(404)
			}
		)
	})
})
