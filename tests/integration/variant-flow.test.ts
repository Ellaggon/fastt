import { describe, it, expect } from "vitest"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider, upsertRoomType } from "../test-support/catalog-db-test-data"

import { POST as createVariantPost } from "@/pages/api/variant/create"
import { POST as setCapacityPost } from "@/pages/api/variant/capacity"
import { POST as attachHotelRoomSubtypePost } from "@/pages/api/variant/subtype/hotel-room"
import { POST as evaluateVariantPost } from "@/pages/api/variant/evaluate"
import { POST as updateVariantStatusPost } from "@/pages/api/variant/status"

import { variantManagementRepository } from "@/container"
import { db, VariantCapacity, Variant, eq } from "astro:db"

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
		if (url !== expected) {
			return new Response("fetch not mocked", { status: 500 })
		}

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
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
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

describe("integration/variant (CAPA 3)", () => {
	it("full flow: create -> capacity -> subtype -> evaluate => ready", async () => {
		const token = "t_a"
		const email = "va@example.com"
		const providerId = "prov_variant_a"
		const destinationId = "dest_variant_a"
		const productId = `prod_variant_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "V Dest",
			type: "city",
			country: "CL",
			slug: "v-dest",
		})
		await upsertProvider({ id: providerId, displayName: "V Provider", ownerEmail: email })
		await upsertRoomType({ id: "double", name: "Double", maxOccupancy: 2 })
		await upsertProduct({
			id: productId,
			name: "V Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_a", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Double")
			fd.set("kind", "hotel_room")

			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const json = (await readJson(res)) as any
			expect(json.variantId).toBeTruthy()
			const variantId = json.variantId as string

			const capFd = new FormData()
			capFd.set("variantId", variantId)
			capFd.set("minOccupancy", "1")
			capFd.set("maxOccupancy", "2")
			capFd.set("maxAdults", "2")
			capFd.set("maxChildren", "0")

			const capRes = await setCapacityPost({
				request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: capFd }),
			} as any)
			expect(capRes.status).toBe(200)

			const subFd = new FormData()
			subFd.set("variantId", variantId)
			subFd.set("roomTypeId", "double")

			const subRes = await attachHotelRoomSubtypePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/subtype/hotel-room",
					token,
					form: subFd,
				}),
			} as any)
			expect(subRes.status).toBe(200)

			const evalFd = new FormData()
			evalFd.set("variantId", variantId)

			const evalRes = await evaluateVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/evaluate", token, form: evalFd }),
			} as any)
			expect(evalRes.status).toBe(200)
			const ev = (await readJson(evalRes)) as any
			expect(ev.state).toBe("ready")
			expect(Array.isArray(ev.validationErrors)).toBe(true)
			expect(ev.validationErrors.some((e: any) => e.code === "pricing_missing")).toBe(true)
			expect(ev.validationErrors.some((e: any) => e.code === "inventory_missing")).toBe(true)

			const v = await variantManagementRepository.getVariantById(variantId)
			expect(v?.status).toBe("ready")
			expect(v?.isActive).toBe(true)
		})
	})

	it("missing capacity => draft", async () => {
		const token = "t_b"
		const email = "vb@example.com"
		const providerId = "prov_variant_b"
		const destinationId = "dest_variant_b"
		const productId = `prod_variant_b_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "V Dest B",
			type: "city",
			country: "CL",
			slug: "v-dest-b",
		})
		await upsertProvider({ id: providerId, displayName: "V Provider B", ownerEmail: email })
		await upsertRoomType({ id: "double_b", name: "DoubleB", maxOccupancy: 2 })
		await upsertProduct({
			id: productId,
			name: "V Hotel B",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_b", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Double")
			fd.set("kind", "hotel_room")
			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			const { variantId } = (await readJson(res)) as any

			const subFd = new FormData()
			subFd.set("variantId", variantId)
			subFd.set("roomTypeId", "double_b")
			await attachHotelRoomSubtypePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/subtype/hotel-room",
					token,
					form: subFd,
				}),
			} as any)

			const evalFd = new FormData()
			evalFd.set("variantId", variantId)
			const evalRes = await evaluateVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/evaluate", token, form: evalFd }),
			} as any)
			const ev = (await readJson(evalRes)) as any
			expect(ev.state).toBe("draft")
			expect(ev.validationErrors.some((e: any) => e.code === "missing_capacity")).toBe(true)
			expect(ev.validationErrors.some((e: any) => e.code === "pricing_missing")).toBe(true)
			expect(ev.validationErrors.some((e: any) => e.code === "inventory_missing")).toBe(true)
		})
	})

	it("missing subtype no longer blocks readiness", async () => {
		const token = "t_c"
		const email = "vc@example.com"
		const providerId = "prov_variant_c"
		const destinationId = "dest_variant_c"
		const productId = `prod_variant_c_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "V Dest C",
			type: "city",
			country: "CL",
			slug: "v-dest-c",
		})
		await upsertProvider({ id: providerId, displayName: "V Provider C", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "V Hotel C",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_c", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Double")
			fd.set("kind", "hotel_room")
			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			const { variantId } = (await readJson(res)) as any

			const capFd = new FormData()
			capFd.set("variantId", variantId)
			capFd.set("minOccupancy", "1")
			capFd.set("maxOccupancy", "2")
			const capRes = await setCapacityPost({
				request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: capFd }),
			} as any)
			expect(capRes.status).toBe(200)

			const evalFd = new FormData()
			evalFd.set("variantId", variantId)
			const evalRes = await evaluateVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/evaluate", token, form: evalFd }),
			} as any)
			const ev = (await readJson(evalRes)) as any
			expect(ev.state).toBe("ready")
			expect(ev.validationErrors.some((e: any) => e.code === "missing_subtype")).toBe(false)
			expect(ev.validationErrors.some((e: any) => e.code === "pricing_missing")).toBe(true)
			expect(ev.validationErrors.some((e: any) => e.code === "inventory_missing")).toBe(true)
		})
	})

	it("cannot set sellable (reserved until CAPA 4/5)", async () => {
		const token = "t_sellable"
		const email = "sellable@example.com"
		const providerId = "prov_variant_sellable"
		const destinationId = "dest_variant_sellable"
		const productId = `prod_variant_sellable_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Sell Dest",
			type: "city",
			country: "CL",
			slug: "sell-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Sell Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Sell Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_sell", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room X")
			fd.set("kind", "hotel_room")
			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const { variantId } = (await readJson(res)) as any

			const st = new FormData()
			st.set("variantId", variantId)
			st.set("status", "sellable")
			const stRes = await updateVariantStatusPost({
				request: makeAuthedFormRequest({ path: "/api/variant/status", token, form: st }),
			} as any)
			expect(stRes.status).toBe(400)
			const body = (await readJson(stRes)) as any
			expect(body?.error).toBe("validation_error")
		})
	})

	it("capacity overwrite: second setCapacity updates canonical VariantCapacity only", async () => {
		const token = "t_cap_over"
		const email = "capover@example.com"
		const providerId = "prov_variant_cap_over"
		const destinationId = "dest_variant_cap_over"
		const productId = `prod_variant_cap_over_${crypto.randomUUID()}`

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

		await withSupabaseAuthStub({ [token]: { id: "u_cap", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Cap")
			fd.set("kind", "hotel_room")
			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const { variantId } = (await readJson(res)) as any

			const cap1 = new FormData()
			cap1.set("variantId", variantId)
			cap1.set("minOccupancy", "1")
			cap1.set("maxOccupancy", "2")
			expect(
				(
					await setCapacityPost({
						request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: cap1 }),
					} as any)
				).status
			).toBe(200)

			const cap2 = new FormData()
			cap2.set("variantId", variantId)
			cap2.set("minOccupancy", "1")
			cap2.set("maxOccupancy", "3")
			expect(
				(
					await setCapacityPost({
						request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: cap2 }),
					} as any)
				).status
			).toBe(200)

			const rows = await db
				.select()
				.from(VariantCapacity)
				.where(eq(VariantCapacity.variantId, variantId))
				.all()
			expect(rows.length).toBe(1)
			expect(rows[0].minOccupancy).toBe(1)
			expect(rows[0].maxOccupancy).toBe(3)
		})
	})

	it("duplicate subtype attach is rejected", async () => {
		const token = "t_dupsub"
		const email = "dupsub@example.com"
		const providerId = "prov_variant_dupsub"
		const destinationId = "dest_variant_dupsub"
		const productId = `prod_variant_dupsub_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Dup Dest",
			type: "city",
			country: "CL",
			slug: "dup-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Dup Provider", ownerEmail: email })
		await upsertRoomType({ id: "rt_dup", name: "RTDup", maxOccupancy: 2 })
		await upsertProduct({
			id: productId,
			name: "Dup Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_dup", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room Dup")
			fd.set("kind", "hotel_room")
			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const { variantId } = (await readJson(res)) as any

			const sub = new FormData()
			sub.set("variantId", variantId)
			sub.set("roomTypeId", "rt_dup")
			expect(
				(
					await attachHotelRoomSubtypePost({
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
			sub2.set("roomTypeId", "rt_dup")
			const res2 = await attachHotelRoomSubtypePost({
				request: makeAuthedFormRequest({
					path: "/api/variant/subtype/hotel-room",
					token,
					form: sub2,
				}),
			} as any)
			expect(res2.status).toBe(400)
			const body = (await readJson(res2)) as any
			expect(body?.error).toBe("validation_error")
		})
	})

	it("ownership: user B cannot modify user A's variant => 404", async () => {
		const tokenA = "t_own_a"
		const tokenB = "t_own_b"
		const emailA = "owna@example.com"
		const emailB = "ownb@example.com"
		const providerA = "prov_own_a"
		const providerB = "prov_own_b"
		const destinationId = "dest_own"
		const productId = `prod_own_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Own Dest",
			type: "city",
			country: "CL",
			slug: "own-dest",
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

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_oa", email: emailA },
				[tokenB]: { id: "u_ob", email: emailB },
			},
			async () => {
				const fd = new FormData()
				fd.set("productId", productId)
				fd.set("name", "Room Double")
				fd.set("kind", "hotel_room")
				const res = await createVariantPost({
					request: makeAuthedFormRequest({ path: "/api/variant/create", token: tokenA, form: fd }),
				} as any)
				const { variantId } = (await readJson(res)) as any

				const capFd = new FormData()
				capFd.set("variantId", variantId)
				capFd.set("minOccupancy", "1")
				capFd.set("maxOccupancy", "2")

				const capRes = await setCapacityPost({
					request: makeAuthedFormRequest({
						path: "/api/variant/capacity",
						token: tokenB,
						form: capFd,
					}),
				} as any)
				expect(capRes.status).toBe(404)
			}
		)
	})

	it("kind mismatch vs product type => 400", async () => {
		const token = "t_m"
		const email = "m@example.com"
		const providerId = "prov_m"
		const destinationId = "dest_m"
		const productId = `prod_m_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "M Dest",
			type: "city",
			country: "CL",
			slug: "m-dest",
		})
		await upsertProvider({ id: providerId, displayName: "M Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "M Tour",
			productType: "Tour",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_m", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Bad Variant")
			fd.set("kind", "hotel_room")

			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(res.status).toBe(400)
		})
	})

	it("invalid occupancy => 500 (currently) - demonstrates need for structured validation", async () => {
		// Keep existing contract simple for now; we assert the behavior is rejecting.
		const token = "t_occ"
		const email = "occ@example.com"
		const providerId = "prov_occ"
		const destinationId = "dest_occ"
		const productId = `prod_occ_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Occ Dest",
			type: "city",
			country: "CL",
			slug: "occ-dest",
		})
		await upsertProvider({ id: providerId, displayName: "Occ Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Occ Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_occ", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room")
			fd.set("kind", "hotel_room")
			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			const { variantId } = (await readJson(res)) as any

			const capFd = new FormData()
			capFd.set("variantId", variantId)
			capFd.set("minOccupancy", "3")
			capFd.set("maxOccupancy", "2")
			const capRes = await setCapacityPost({
				request: makeAuthedFormRequest({ path: "/api/variant/capacity", token, form: capFd }),
			} as any)
			expect([400, 500]).toContain(capRes.status)
		})
	})
})
