import { afterEach, describe, expect, it, vi } from "vitest"

import { productRepository } from "@/container"
import { POST as createProductPost } from "@/pages/api/product/create"
import { upsertDestination } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

const previousFetch = globalThis.fetch
const previousSupabaseUrl = process.env.SUPABASE_URL
const previousSupabaseKey = process.env.SUPABASE_ANON_KEY

afterEach(() => {
	globalThis.fetch = previousFetch
	if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL
	else process.env.SUPABASE_URL = previousSupabaseUrl
	if (previousSupabaseKey === undefined) delete process.env.SUPABASE_ANON_KEY
	else process.env.SUPABASE_ANON_KEY = previousSupabaseKey
	vi.restoreAllMocks()
})

function installAuth(token: string, user: { id: string; email: string }) {
	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input) !== "https://supabase.test/auth/v1/user") {
			return new Response("unexpected fetch", { status: 500 })
		}
		const headers = new Headers(init?.headers)
		return headers.get("Authorization") === `Bearer ${token}`
			? Response.json(user)
			: new Response("Unauthorized", { status: 401 })
	}) as typeof fetch
}

function request(token: string, form: FormData) {
	return new Request("http://localhost:4321/api/product/create", {
		method: "POST",
		headers: { cookie: `sb-access-token=${token}; sb-refresh-token=r` },
		body: form,
	})
}

describe("tour wizard create endpoint", () => {
	it("supports fetch JSON and native 303 without losing launch-tour", async () => {
		const token = "tour_wizard_token"
		const email = "tour-wizard@example.com"
		const providerId = "prov_tour_wizard_create"
		const destinationId = "dest_tour_wizard_create"
		await upsertDestination({
			id: destinationId,
			name: "Destino Tour Wizard",
			type: "city",
			country: "BO",
			slug: "destino-tour-wizard",
		})
		await upsertProvider({ id: providerId, displayName: "Tour Wizard", ownerEmail: email })
		installAuth(token, { id: "user_tour_wizard", email })

		const jsonForm = new FormData()
		jsonForm.set("name", "Explora el centro histórico")
		jsonForm.set("productType", "Tour")
		jsonForm.set("destinationId", destinationId)
		jsonForm.set("playbook", "launch-tour")
		jsonForm.set("_response", "json")
		const jsonResponse = await createProductPost({ request: request(token, jsonForm) } as any)
		expect(jsonResponse.status).toBe(200)
		const created = (await jsonResponse.json()) as { id: string }
		expect((await productRepository.getProductAggregate(created.id))?.product.productType).toBe("Tour")

		const nativeForm = new FormData()
		nativeForm.set("name", "Descubre el mercado local")
		nativeForm.set("productType", "Tour")
		nativeForm.set("destinationId", destinationId)
		nativeForm.set("playbook", "launch-tour")
		nativeForm.set("_response", "redirect")
		const nativeResponse = await createProductPost({ request: request(token, nativeForm) } as any)
		expect(nativeResponse.status).toBe(303)
		expect(nativeResponse.headers.get("Location")).toMatch(
			/^\/product\/[^/]+\/content\?step=content&flow=create&playbook=launch-tour$/
		)
	}, 20_000)
})
