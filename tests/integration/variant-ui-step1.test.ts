import { describe, it, expect } from "vitest"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as createVariantPost } from "@/pages/api/variant/create"

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

describe("integration/variants UI Step 1 (create variant) - simulated", () => {
	it("create variant via API and build expected redirect URL to capacity step", async () => {
		const token = "t_ui_v1"
		const email = "ui-v1@example.com"
		const providerId = "prov_ui_v1"
		const destinationId = "dest_ui_v1"
		const productId = `prod_ui_v1_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "UI Dest",
			type: "city",
			country: "CL",
			slug: "ui-dest",
		})
		await upsertProvider({ id: providerId, displayName: "UI Provider", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "UI Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_ui_v1", email } }, async () => {
			const fd = new FormData()
			fd.set("productId", productId)
			fd.set("name", "Room UI")
			fd.set("kind", "hotel_room")
			fd.set("description", "Optional")

			const res = await createVariantPost({
				request: makeAuthedFormRequest({ path: "/api/variant/create", token, form: fd }),
			} as any)
			expect(res.status).toBe(200)
			const json = (await readJson(res)) as any
			expect(typeof json?.variantId).toBe("string")

			const expectedNext = `/product/${encodeURIComponent(productId)}/variants/${encodeURIComponent(
				json.variantId
			)}/capacity`
			expect(expectedNext).toContain(`/product/${encodeURIComponent(productId)}/variants/`)
			expect(expectedNext).toContain("/capacity")
		})
	})
})
