import { describe, expect, it, vi } from "vitest"
import { db, PricingBaseRate, eq } from "astro:db"

import { POST as setBaseRatePost } from "@/pages/api/pricing/base-rate"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import {
	defineRatePlanFirstTestSuite,
	type RatePlanContextIds,
} from "../helpers/ratePlanFirstTestSuite"

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

type SeededContext = RatePlanContextIds & {
	token: string
	email: string
	otherVariantId: string
}

let currentSeed: SeededContext | null = null

async function seedRatePlanContext(): Promise<RatePlanContextIds> {
	const suffix = crypto.randomUUID()
	const token = `t_br_rpf_${suffix}`
	const email = `br-rpf-${suffix}@example.com`
	const providerId = `prov_br_rpf_${suffix}`
	const destinationId = `dest_br_rpf_${suffix}`
	const productId = `prod_br_rpf_${suffix}`
	const variantId = `var_br_rpf_${suffix}`
	const otherVariantId = `var_br_rpf_other_${suffix}`
	const ratePlanTemplateId = `rpt_br_rpf_${suffix}`
	const ratePlanId = `rp_br_rpf_${suffix}`

	await upsertDestination({
		id: destinationId,
		name: "RatePlan First Dest",
		type: "city",
		country: "CL",
		slug: `br-rpf-${suffix}`,
	})
	await upsertProvider({ id: providerId, displayName: "Provider RPF", ownerEmail: email })
	await upsertProduct({
		id: productId,
		name: "Product RPF",
		productType: "Hotel",
		destinationId,
		providerId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: "Variant Principal",
		baseRateCurrency: "USD",
		baseRatePrice: 50,
	})
	await upsertVariant({
		id: otherVariantId,
		productId,
		kind: "hotel_room",
		name: "Variant Secundaria",
		baseRateCurrency: "USD",
		baseRatePrice: 70,
	})
	await upsertRatePlanTemplate({
		id: ratePlanTemplateId,
		name: "Default",
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlan({
		id: ratePlanId,
		templateId: ratePlanTemplateId,
		variantId,
		isActive: true,
		isDefault: true,
	})

	currentSeed = {
		productId,
		variantId,
		ratePlanId,
		token,
		email,
		otherVariantId,
	}
	return { productId, variantId, ratePlanId }
}

describe("integration/api pricing base-rate ratePlan-first", () => {
	defineRatePlanFirstTestSuite({
		suiteName: "api/pricing/base-rate ratePlan-first invariants",
		seedContext: seedRatePlanContext,
		execute: async (input) => {
			if (!currentSeed) throw new Error("seed context not initialized")
			return withSupabaseAuthStub(
				{ [currentSeed.token]: { id: "u_br_rpf", email: currentSeed.email } },
				async () => {
					const form = new FormData()
					if (input.variantId) form.set("variantId", input.variantId)
					if (input.ratePlanId) form.set("ratePlanId", input.ratePlanId)
					form.set("currency", "USD")
					form.set("basePrice", "157")
					return setBaseRatePost({
						request: makeAuthedFormRequest({
							path: "/api/pricing/base-rate",
							token: currentSeed.token,
							form,
						}),
					} as any)
				}
			)
		},
		expectedMissingContext: {
			status: 400,
			body: { error: "ratePlanId_required" },
		},
		expectedRatePlanNotFound: {
			status: 404,
			body: { error: "ratePlan_not_found" },
		},
		mismatchLogEvent: "rateplan_variant_mismatch_ignored",
		assertScenario: async ({ scenario, seeded, response, body }) => {
			if (
				scenario === "rateplan_only" ||
				scenario === "both_consistent" ||
				scenario === "rateplan_mismatch"
			) {
				expect(response.status).toBe(200)
				expect(typeof body?.defaultRatePlanId === "string" || body?.defaultRatePlanId == null).toBe(
					true
				)
				const row = await db
					.select()
					.from(PricingBaseRate)
					.where(eq(PricingBaseRate.variantId, seeded.variantId))
					.get()
				expect(row?.basePrice).toBe(157)
				expect(row?.currency).toBe("USD")
			}
		},
	})

	it("solo variantId ya no es válido en modo canónico", async () => {
		const seeded = (await seedRatePlanContext()) as RatePlanContextIds
		if (!currentSeed) throw new Error("seed context not initialized")
		await withSupabaseAuthStub(
			{ [currentSeed.token]: { id: "u_br_rpf_only_var", email: currentSeed.email } },
			async () => {
				const form = new FormData()
				form.set("variantId", seeded.variantId)
				form.set("currency", "USD")
				form.set("basePrice", "157")
				const response = await setBaseRatePost({
					request: makeAuthedFormRequest({
						path: "/api/pricing/base-rate",
						token: currentSeed.token,
						form,
					}),
				} as any)
				const payload = await readJson(response)
				expect(response.status).toBe(400)
				expect(payload).toEqual({ error: "ratePlanId_required" })
			}
		)
	})

	it("pricing determinism: mismo ratePlanId ignora variantId cliente y conserva resultado", async () => {
		const seeded = (await seedRatePlanContext()) as RatePlanContextIds
		if (!currentSeed) throw new Error("seed context not initialized")
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		await withSupabaseAuthStub(
			{ [currentSeed.token]: { id: "u_br_rpf_det", email: currentSeed.email } },
			async () => {
				const first = new FormData()
				first.set("ratePlanId", seeded.ratePlanId)
				first.set("variantId", seeded.variantId)
				first.set("currency", "USD")
				first.set("basePrice", "333")
				const firstResponse = await setBaseRatePost({
					request: makeAuthedFormRequest({
						path: "/api/pricing/base-rate",
						token: currentSeed!.token,
						form: first,
					}),
				} as any)
				expect(firstResponse.status).toBe(200)

				const second = new FormData()
				second.set("ratePlanId", seeded.ratePlanId)
				second.set("variantId", currentSeed!.otherVariantId)
				second.set("currency", "USD")
				second.set("basePrice", "333")
				const secondResponse = await setBaseRatePost({
					request: makeAuthedFormRequest({
						path: "/api/pricing/base-rate",
						token: currentSeed!.token,
						form: second,
					}),
				} as any)
				expect(secondResponse.status).toBe(200)
			}
		)

		const mainVariantRow = await db
			.select()
			.from(PricingBaseRate)
			.where(eq(PricingBaseRate.variantId, seeded.variantId))
			.get()
		const otherVariantRow = await db
			.select()
			.from(PricingBaseRate)
			.where(eq(PricingBaseRate.variantId, currentSeed.otherVariantId))
			.get()

		expect(mainVariantRow?.basePrice).toBe(333)
		expect(otherVariantRow?.basePrice).not.toBe(333)
		expect(
			warnSpy.mock.calls.some((call) => call[0]?.event === "rateplan_variant_mismatch_ignored")
		).toBe(true)
		warnSpy.mockRestore()
	})
})
