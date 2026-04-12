import { describe, expect, it } from "vitest"

import { GET as definitionsGet } from "@/pages/api/provider/tax-fees/definitions"
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

describe("integration/provider tax-fees definitions GET", () => {
	it("returns empty definitions payload without DB errors", async () => {
		const token = "t_definitions_empty"
		const email = "tax-fees-empty@example.com"
		const providerId = "prov_tax_fees_empty"

		await upsertProvider({ id: providerId, displayName: "Prov Empty", ownerEmail: email })

		await withSupabaseAuthStub({ [token]: { id: "u_empty", email } }, async () => {
			const headers = new Headers()
			headers.set(
				"cookie",
				`sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=test-refresh`
			)

			const response = await definitionsGet({
				request: new Request("http://localhost:4321/api/provider/tax-fees/definitions", {
					headers,
				}),
			} as any)

			expect(response.status).toBe(200)
			const body = await response.json()
			expect(body).toEqual({
				definitions: [],
				warnings: [],
			})
		})
	})
})
