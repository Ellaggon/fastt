import { describe, expect, it } from "vitest"

import {
	declareProviderCommercialLineCollectionModel,
	enrollProviderCommercialLine,
	listProviderCommercialLines,
} from "@/lib/verification/commercial-lines"
import { POST } from "@/pages/api/provider/settings/commercial-line-collection-model"
import { upsertProvider } from "../test-support/catalog-db-test-data"

function authedRequest(token: string, line: string, collectionModel: string): Request {
	const form = new FormData()
	form.set("line", line)
	form.set("collectionModel", collectionModel)
	return new Request(
		"http://localhost:4321/api/provider/settings/commercial-line-collection-model",
		{
			method: "POST",
			headers: {
				cookie: `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`,
				accept: "application/json",
			},
			body: form,
		}
	)
}

describe("provider collection declaration guard", () => {
	it("rejects direct unsupported declarations and preserves both commercial lines", async () => {
		const providerId = `provider_collection_guard_${crypto.randomUUID()}`
		const email = `collection-guard-${crypto.randomUUID()}@example.com`
		const userId = `user_${email}`
		const token = "collection-guard-token"
		await upsertProvider({ id: providerId, ownerEmail: email })
		for (const line of ["tour", "lodging"] as const) {
			await enrollProviderCommercialLine({
				providerId,
				line,
				source: "onboarding",
				enrolledByUserId: userId,
				required: true,
			})
		}

		const previousUrl = process.env.SUPABASE_URL
		const previousKey = process.env.SUPABASE_ANON_KEY
		const previousFetch = globalThis.fetch
		process.env.SUPABASE_URL = "https://supabase.test"
		process.env.SUPABASE_ANON_KEY = "sb_publishable_test"
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url =
				typeof input === "string" ? input : String(input instanceof URL ? input : input.url)
			if (url !== "https://supabase.test/auth/v1/user") return new Response(null, { status: 500 })
			return new Response(JSON.stringify({ id: userId, email }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		}) as typeof fetch

		try {
			for (const [line, model, error] of [
				["tour", "property_collect", "tour_agreement_required"],
				["tour", "platform_collect", "platform_unavailable"],
				["lodging", "platform_collect", "platform_unavailable"],
			] as const) {
				const result = await POST({ request: authedRequest(token, line, model) } as any)
				expect(result.status).toBe(422)
				expect((await result.json()).error).toBe(error)
			}
			const before = await listProviderCommercialLines(providerId)
			expect(before.map(({ line, collectionModel }) => [line, collectionModel])).toEqual([
				["lodging", "undecided"],
				["tour", "undecided"],
			])
			await expect(
				declareProviderCommercialLineCollectionModel({
					providerId,
					line: "tour",
					collectionModel: "platform_collect",
					declaredByUserId: userId,
				})
			).rejects.toThrow("PLATFORM_COLLECTION_UNAVAILABLE")

			const allowed = await POST({
				request: authedRequest(token, "lodging", "property_collect"),
			} as any)
			expect(allowed.status).toBe(200)
			expect((await allowed.json()).ok).toBe(true)
			const after = await listProviderCommercialLines(providerId)
			expect(after.find((row) => row.line === "lodging")?.collectionModel).toBe("property_collect")
			expect(after.find((row) => row.line === "tour")?.collectionModel).toBe("undecided")
		} finally {
			globalThis.fetch = previousFetch
			if (previousUrl === undefined) delete process.env.SUPABASE_URL
			else process.env.SUPABASE_URL = previousUrl
			if (previousKey === undefined) delete process.env.SUPABASE_ANON_KEY
			else process.env.SUPABASE_ANON_KEY = previousKey
		}
	})
})
