import { describe, expect, it } from "vitest"
import { db, eq, ProviderProfile, ProviderTaxConfiguration } from "astro:db"
import { POST as providerProfilePost } from "@/pages/api/providers/profile"
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

function makeAuthedFormRequest(params: { token: string; form: FormData }): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	headers.set("accept", "application/json")
	return new Request("http://localhost:4321/api/providers/profile", {
		method: "POST",
		body: params.form,
		headers,
	})
}

describe("integration/provider profile canonical settings", () => {
	it("writes only operational fields to ProviderProfile and never touches fiscal identity", async () => {
		const providerId = "provider_profile_canonical_settings"
		const token = "t_profile_canonical_settings"
		const email = "profile.canonical@example.com"
		const userId = `user_${email}`

		await upsertProvider({
			id: providerId,
			legalName: "Perfil Canonico S.R.L.",
			displayName: "Perfil Canonico",
			ownerEmail: email,
		})

		const form = new FormData()
		form.set("timezone", "America/Santiago")
		form.set("defaultCurrency", "USD")
		form.set("supportEmail", "soporte@canonical.test")
		form.set("supportPhone", "+59170000000")

		await withSupabaseAuthStub({ [token]: { id: userId, email } }, async () => {
			const response = await providerProfilePost({
				request: makeAuthedFormRequest({ token, form }),
			} as any)

			expect(response.status).toBe(200)
		})

		const profile = await db
			.select()
			.from(ProviderProfile)
			.where(eq(ProviderProfile.providerId, providerId))
			.get()
		expect(profile).toMatchObject({
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: "soporte@canonical.test",
			supportPhone: "+59170000000",
		})
		expect(profile).not.toHaveProperty("taxResidenceCountry")
		expect(profile).not.toHaveProperty("fiscalStatus")
		expect(profile).not.toHaveProperty("paymentReadinessStatus")
		expect(profile).not.toHaveProperty("integrationReadinessStatus")

		const taxConfiguration = await db
			.select()
			.from(ProviderTaxConfiguration)
			.where(eq(ProviderTaxConfiguration.providerId, providerId))
			.get()
		expect(taxConfiguration).toBeFalsy()
	})
})
