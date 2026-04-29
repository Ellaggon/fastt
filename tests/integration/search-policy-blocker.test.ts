import { describe, expect, it } from "vitest"
import { and, db, eq, EffectiveAvailability, EffectivePricing, SearchUnitView } from "astro:db"

import { searchOffers } from "@/container"
import { materializeSearchUnitRange } from "@/modules/search/public"
import { ensurePricingCoverageForRequestRuntime } from "@/modules/pricing/public"
import { POST as holdPost } from "@/pages/api/inventory/hold"
import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"
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

describe("integration/search policy blocker", () => {
	it("materializes policy blocker and prevents hold when required policies are missing", async () => {
		const prevFlag = process.env.SEARCH_POLICY_BLOCKER_ENABLED
		process.env.SEARCH_POLICY_BLOCKER_ENABLED = "true"
		try {
			const destinationId = `dest_spb_${crypto.randomUUID()}`
			const providerId = `prov_spb_${crypto.randomUUID()}`
			const productId = `prod_spb_${crypto.randomUUID()}`
			const variantId = `var_spb_${crypto.randomUUID()}`
			const ratePlanTemplateId = `rpt_spb_${crypto.randomUUID()}`
			const ratePlanId = `rp_spb_${crypto.randomUUID()}`
			const date = "2030-06-10"
			const checkout = "2030-06-11"

			await upsertDestination({
				id: destinationId,
				name: "SPB Dest",
				type: "city",
				country: "CL",
				slug: `spb-${crypto.randomUUID()}`,
			})
			await upsertProvider({
				id: providerId,
				displayName: "Provider SPB",
				ownerEmail: `spb-${crypto.randomUUID()}@example.com`,
			})
			await upsertProduct({
				id: productId,
				name: "Policy Blocked Product",
				productType: "Hotel",
				destinationId,
				providerId,
			})
			await upsertVariant({
				id: variantId,
				productId,
				name: "Policy Blocked Room",
				kind: "hotel_room",
				currency: "USD",
				basePrice: 120,
				isActive: true,
			})
			await upsertRatePlanTemplate({
				id: ratePlanTemplateId,
				name: "SPB Plan",
				paymentType: "pay_at_property",
				refundable: true,
			})
			await upsertRatePlan({
				id: ratePlanId,
				templateId: ratePlanTemplateId,
				variantId,
				isActive: true,
				isDefault: true,
			})

			await db
				.insert(EffectiveAvailability)
				.values({
					id: `ea_${variantId}_${date}`,
					variantId,
					date,
					totalUnits: 2,
					heldUnits: 0,
					bookedUnits: 0,
					availableUnits: 2,
					stopSell: false,
					isSellable: true,
					computedAt: new Date(),
				} as any)
				.onConflictDoUpdate({
					target: [EffectiveAvailability.variantId, EffectiveAvailability.date],
					set: {
						totalUnits: 2,
						heldUnits: 0,
						bookedUnits: 0,
						availableUnits: 2,
						stopSell: false,
						isSellable: true,
						computedAt: new Date(),
					},
				})

			await db
				.insert(EffectivePricing)
				.values({
					variantId,
					ratePlanId,
					date,
					basePrice: 120,
					finalBasePrice: 120,
					yieldMultiplier: 1,
					computedAt: new Date(),
				} as any)
				.onConflictDoUpdate({
					target: [EffectivePricing.variantId, EffectivePricing.ratePlanId, EffectivePricing.date],
					set: {
						basePrice: 120,
						finalBasePrice: 120,
						computedAt: new Date(),
					},
				})

			for (const adults of [1, 2]) {
				await ensurePricingCoverageForRequestRuntime({
					variantId,
					ratePlanId,
					checkIn: date,
					checkOut: checkout,
					occupancy: { adults, children: 0, infants: 0 },
				})
			}
			await materializeSearchUnitRange({
				variantId,
				ratePlanId,
				from: date,
				to: checkout,
				currency: "USD",
			})

			const suv = await db
				.select({
					isSellable: SearchUnitView.isSellable,
					primaryBlocker: SearchUnitView.primaryBlocker,
				})
				.from(SearchUnitView)
				.where(
					and(
						eq(SearchUnitView.variantId, variantId),
						eq(SearchUnitView.ratePlanId, ratePlanId),
						eq(SearchUnitView.date, date)
					)
				)
				.get()
			expect(Boolean(suv?.isSellable)).toBe(false)
			expect(String(suv?.primaryBlocker ?? "")).toBe("POLICY_BLOCKED")

			const offers = await searchOffers({
				productId,
				checkIn: new Date(`${date}T00:00:00.000Z`),
				checkOut: new Date(`${checkout}T00:00:00.000Z`),
				adults: 1,
				children: 0,
				rooms: 1,
			})
			expect(offers.length).toBe(0)

			const token = `token_${crypto.randomUUID()}`
			const holdForm = new FormData()
			holdForm.set("variantId", variantId)
			holdForm.set("ratePlanId", ratePlanId)
			holdForm.set("checkIn", date)
			holdForm.set("checkOut", checkout)
			holdForm.set("occupancy", "1")

			await withSupabaseAuthStub(
				{ [token]: { id: `user_${crypto.randomUUID()}`, email: "test@example.com" } },
				async () => {
					const holdRes = await holdPost({
						request: makeAuthedFormRequest({ path: "/api/inventory/hold", token, form: holdForm }),
						params: {},
						locals: {} as any,
					} as any)
					expect(holdRes.status).toBe(409)
					const body = await readJson(holdRes)
					expect(String(body?.error ?? "")).toBe("not_holdable")
					expect(String(body?.reason ?? "")).toContain("POLICY_BLOCKED")
				}
			)
		} finally {
			if (prevFlag === undefined) delete process.env.SEARCH_POLICY_BLOCKER_ENABLED
			else process.env.SEARCH_POLICY_BLOCKER_ENABLED = prevFlag
		}
	})
})
