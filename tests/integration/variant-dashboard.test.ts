import { describe, it, expect } from "vitest"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider, upsertRoomType } from "../test-support/catalog-db-test-data"

import { GET as listVariantsGet } from "@/pages/api/variant/list"
import { POST as createVariantPost } from "@/pages/api/variant/create"
import { POST as setCapacityPost } from "@/pages/api/variant/capacity"
import { POST as attachSubtypePost } from "@/pages/api/variant/subtype/hotel-room"
import { POST as evaluateVariantPost } from "@/pages/api/variant/evaluate"

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

function continueSetupUrl(pid: string, variant: any): string {
	if (!variant.capacity)
		return `/product-v2/${encodeURIComponent(pid)}/variants/${encodeURIComponent(variant.id)}/capacity`
	if (!variant.subtype)
		return `/product-v2/${encodeURIComponent(pid)}/variants/${encodeURIComponent(variant.id)}/room-type`
	return `/product-v2/${encodeURIComponent(pid)}/variants/${encodeURIComponent(variant.id)}/pricing`
}

describe("integration/variant dashboard behavior (API + routing decisions)", () => {
	it("empty state: product without variants => []", async () => {
		const token = "t_dash_empty"
		const email = "dash-empty@example.com"
		const providerId = "prov_dash_empty"
		const destinationId = "dest_dash_empty"
		const productId = `prod_dash_empty_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Dash Dest",
			type: "city",
			country: "CL",
			slug: "dash-dest",
		})
		await upsertProvider({ id: providerId, companyName: "Dash Provider", userEmail: email })
		await upsertProduct({
			id: productId,
			name: "Dash Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_dash_empty", email } }, async () => {
			const res = await listVariantsGet({
				request: makeAuthedGetRequest({
					path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
					token,
				}),
			} as any)
			expect(res.status).toBe(200)
			expect(await readJson(res)).toEqual([])
		})
	})

	it("continue setup routing: no capacity => /capacity; with capacity => /room-type; complete => /pricing", async () => {
		const token = "t_dash_route"
		const email = "dash-route@example.com"
		const providerId = "prov_dash_route"
		const destinationId = "dest_dash_route"
		const productId = `prod_dash_route_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Route Dest",
			type: "city",
			country: "CL",
			slug: "route-dest",
		})
		await upsertProvider({ id: providerId, companyName: "Route Provider", userEmail: email })
		await upsertProduct({
			id: productId,
			name: "Route Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertRoomType({ id: "rt_dash_route", name: "Double", maxOccupancy: 2 })

		await withSupabaseAuthStub({ [token]: { id: "u_dash_route", email } }, async () => {
			// Create variant
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Route")
			fd.set("kind", "hotel_room")
			const createRes = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(createRes.status).toBe(200)
			const { variantId } = (await readJson(createRes)) as any

			// List -> should route to capacity
			const list1 = await listVariantsGet({
				request: makeAuthedGetRequest({
					path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
					token,
				}),
			} as any)
			const v1 = (await readJson(list1)) as any[]
			expect(v1.length).toBe(1)
			expect(continueSetupUrl(productId, v1[0])).toContain(
				`/variants/${encodeURIComponent(variantId)}/capacity`
			)

			// Set capacity
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

			// List -> should route to room-type
			const list2 = await listVariantsGet({
				request: makeAuthedGetRequest({
					path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
					token,
				}),
			} as any)
			const v2 = (await readJson(list2)) as any[]
			expect(v2[0].capacity).toBeTruthy()
			expect(v2[0].subtype).toBeNull()
			expect(continueSetupUrl(productId, v2[0])).toContain(
				`/variants/${encodeURIComponent(variantId)}/room-type`
			)

			// Attach subtype
			const sub = new FormData()
			sub.set("variantId", variantId)
			sub.set("roomTypeId", "rt_dash_route")
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

			// List -> should route to pricing
			const list3 = await listVariantsGet({
				request: makeAuthedGetRequest({
					path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
					token,
				}),
			} as any)
			const v3 = (await readJson(list3)) as any[]
			expect(v3[0].subtype).toBeTruthy()
			expect(continueSetupUrl(productId, v3[0])).toContain(
				`/variants/${encodeURIComponent(variantId)}/pricing`
			)
		})
	})

	it("evaluate: returns state draft before complete, ready after capacity+subtype", async () => {
		const token = "t_dash_eval"
		const email = "dash-eval@example.com"
		const providerId = "prov_dash_eval"
		const destinationId = "dest_dash_eval"
		const productId = `prod_dash_eval_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Eval Dest",
			type: "city",
			country: "CL",
			slug: "eval-dest",
		})
		await upsertProvider({ id: providerId, companyName: "Eval Provider", userEmail: email })
		await upsertProduct({
			id: productId,
			name: "Eval Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertRoomType({ id: "rt_dash_eval", name: "Suite", maxOccupancy: 3 })

		await withSupabaseAuthStub({ [token]: { id: "u_dash_eval", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Eval")
			fd.set("kind", "hotel_room")
			const createRes = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			const { variantId } = (await readJson(createRes)) as any

			const evalFd1 = new FormData()
			evalFd1.set("variantId", variantId)
			const evalRes1 = await evaluateVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/evaluate", token, form: evalFd1 }),
			} as any)
			expect(evalRes1.status).toBe(200)
			const ev1 = (await readJson(evalRes1)) as any
			expect(ev1.state).toBe("draft")

			const cap = new FormData()
			cap.set("variantId", variantId)
			cap.set("minOccupancy", "1")
			cap.set("maxOccupancy", "2")
			await setCapacityPost({
				request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: cap }),
			} as any)

			const sub = new FormData()
			sub.set("variantId", variantId)
			sub.set("roomTypeId", "rt_dash_eval")
			await attachSubtypePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/subtype/hotel-room",
					token,
					form: sub,
				}),
			} as any)

			const evalFd2 = new FormData()
			evalFd2.set("variantId", variantId)
			const evalRes2 = await evaluateVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/evaluate", token, form: evalFd2 }),
			} as any)
			expect(evalRes2.status).toBe(200)
			const ev2 = (await readJson(evalRes2)) as any
			expect(ev2.state).toBe("ready")
		})
	})

	it("ownership: provider B listing provider A product => 404", async () => {
		const tokenA = "t_dash_own_a"
		const tokenB = "t_dash_own_b"
		const emailA = "dash-own-a@example.com"
		const emailB = "dash-own-b@example.com"
		const providerA = "prov_dash_own_a"
		const providerB = "prov_dash_own_b"
		const destinationId = "dest_dash_own"
		const productId = `prod_dash_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Own Dest",
			type: "city",
			country: "CL",
			slug: "own-dash",
		})
		await upsertProvider({ id: providerA, companyName: "Own Dash A", userEmail: emailA })
		await upsertProvider({ id: providerB, companyName: "Own Dash B", userEmail: emailB })
		await upsertProduct({
			id: productId,
			name: "Own Dash Hotel",
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
				const res = await listVariantsGet({
					request: makeAuthedGetRequest({
						path: `/api/variant/list?productId=${encodeURIComponent(productId)}`,
						token: tokenB,
					}),
				} as any)
				expect(res.status).toBe(404)
			}
		)
	})
})
