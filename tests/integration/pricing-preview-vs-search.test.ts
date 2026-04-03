import { describe, it, expect } from "vitest"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
	upsertPriceRule,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as previewPost } from "@/pages/api/pricing/preview"
import { baseRateRepository, searchOffers, dailyInventoryRepository } from "@/container"

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

describe("integration/pricing preview vs search parity", () => {
	it("preview.finalPrice equals search computed price for default plan (1 night, no promotions)", async () => {
		const token = "t_prev_vs_search"
		const email = "prev-vs-search@example.com"
		const providerId = "prov_prev_vs_search"
		const destinationId = "dest_prev_vs_search"
		const productId = `prod_prev_vs_search_${crypto.randomUUID()}`
		const variantId = `var_prev_vs_search_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Dest",
			type: "city",
			country: "CL",
			slug: "dest",
		})
		await upsertProvider({ id: providerId, displayName: "Prov", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: "hr",
			name: "Room",
			currency: "USD",
			basePrice: 999,
		})

		await baseRateRepository.upsert({ variantId, currency: "USD", basePrice: 100 })

		// Search requires inventory rows for the stay dates to consider the variant available.
		await dailyInventoryRepository.upsert({
			id: `di_${crypto.randomUUID()}`,
			variantId,
			date: "2026-03-10",
			totalInventory: 5,
			reservedCount: 0,
		})
		await dailyInventoryRepository.upsert({
			id: `di_${crypto.randomUUID()}`,
			variantId,
			date: "2026-03-11",
			totalInventory: 5,
			reservedCount: 0,
		})

		const templateId = `rpt_prev_vs_search_${crypto.randomUUID()}`
		const ratePlanId = `rp_prev_vs_search_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "prepaid",
			refundable: false,
		})
		await upsertRatePlan({ id: ratePlanId, templateId, variantId, isActive: true, isDefault: true })
		await upsertPriceRule({
			id: `pr_prev_vs_search_${crypto.randomUUID()}`,
			ratePlanId,
			type: "percentage",
			value: 10,
			isActive: true,
		})

		await withSupabaseAuthStub({ [token]: { id: "u_prev_vs_search", email } }, async () => {
			// Preview (engine)
			const fd = new FormData()
			fd.set("variantId", variantId)
			const previewRes = await previewPost({
				request: makeAuthedFormRequest({ path: "/api/pricing/preview", token, form: fd }),
			} as any)
			expect(previewRes.status).toBe(200)
			const previewBody = (await readJson(previewRes)) as any
			expect(previewBody?.finalPrice).toBe(110)

			// Search (pipeline)
			const offers = await searchOffers({
				productId,
				checkIn: new Date("2026-03-10"),
				checkOut: new Date("2026-03-11"),
				adults: 2,
				children: 0,
			})

			const offerForVariant = offers.find((o) => o.variantId === variantId)
			expect(offerForVariant).toBeTruthy()

			const rpOffer = offerForVariant?.ratePlans.find((rp: any) => rp.ratePlanId === ratePlanId)
			expect(rpOffer).toBeTruthy()
			expect(rpOffer?.finalPrice).toBe(previewBody.finalPrice)
		})
	})
})
