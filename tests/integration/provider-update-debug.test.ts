import { describe, expect, it } from "vitest"
import { db, Provider, ProviderUser, eq, sql } from "astro:db"
import { POST as updateProviderPost } from "@/pages/api/providers/[id]"
import { requireProvider } from "@/lib/auth/requireProvider"

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

function makeAuthedFormRequest(params: { path: string; token: string; form: FormData }): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	headers.set("accept", "text/html")
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		body: params.form,
		headers,
	})
}

function makeAuthedRequest(params: { path: string; token: string }): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "GET",
		headers,
	})
}

describe("debug/provider update read-after-write consistency", () => {
	it("logs providerId + values for update and dashboard-equivalent read", async () => {
		const token = "t_provider_debug"
		const userId = "u_provider_debug"
		const email = "provider.debug@example.com"
		const providerByEmailId = "prov_by_email"

		await db.run(sql`INSERT INTO User (id, email) VALUES (${userId}, ${email})`)

		await db.insert(Provider).values({
			id: providerByEmailId,
			legalName: "Old Email Legal",
			displayName: "Old Email Display",
			status: "draft",
		})
		await db.insert(ProviderUser).values({
			id: crypto.randomUUID(),
			providerId: providerByEmailId,
			userId,
			role: "owner",
		})

		await withSupabaseAuthStub({ [token]: { id: userId, email } }, async () => {
			const form = new FormData()
			form.set("displayName", "New Display Name")
			form.set("legalName", "New Legal Name")

			const updateRes = await updateProviderPost({
				request: makeAuthedFormRequest({
					path: `/api/providers/${providerByEmailId}`,
					token,
					form,
				}),
				params: { id: providerByEmailId },
			} as any)
			const updateText = await updateRes.text()
			console.log({
				step: "debug_update_http_response",
				status: updateRes.status,
				body: updateText,
			})

			const auth = await requireProvider(makeAuthedRequest({ path: "/provider", token }))
			const providerRead = await db
				.select()
				.from(Provider)
				.where(eq(Provider.id, auth.providerId))
				.get()
			const providerEmail = await db
				.select()
				.from(Provider)
				.where(eq(Provider.id, providerByEmailId))
				.get()
			console.log({
				step: "debug_provider_compare",
				updateResponseStatus: updateRes.status,
				requireProviderProviderId: auth.providerId,
				providerRead,
				providerEmail,
			})

			expect(auth.providerId).toBe(providerByEmailId)
			expect(providerRead?.displayName).toBe("New Display Name")
			expect(providerRead?.legalName).toBe("New Legal Name")
			expect(providerEmail?.displayName).toBe("New Display Name")
			expect(providerEmail?.legalName).toBe("New Legal Name")
		})
	})
})
