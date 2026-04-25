import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { GET as resolvePoliciesGet } from "@/pages/api/policies/resolve"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { defineRatePlanFirstTestSuite } from "../helpers/ratePlanFirstTestSuite"

function createCookiesStub() {
	const store = new Map<string, string>()
	return {
		get(name: string) {
			const value = store.get(name)
			return value == null ? undefined : { value }
		},
		set(name: string, value: string) {
			store.set(name, value)
		},
	}
}

async function seedRatePlanContext() {
	const suffix = crypto.randomUUID()
	const destinationId = `dest_prf_${suffix}`
	const productId = `prod_prf_${suffix}`
	const variantId = `var_prf_${suffix}`
	const ratePlanTemplateId = `rpt_prf_${suffix}`
	const ratePlanId = `rp_prf_${suffix}`

	await upsertDestination({
		id: destinationId,
		name: "RatePlan First Dest",
		type: "city",
		country: "CL",
		slug: `prf-${suffix}`,
	})
	await upsertProduct({
		id: productId,
		name: "RatePlan First Product",
		productType: "Hotel",
		destinationId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: "RatePlan First Variant",
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

	return { productId, variantId, ratePlanId }
}

function makeUrl(params: Record<string, string | undefined>) {
	const url = new URL("http://localhost:4321/api/policies/resolve")
	for (const [key, value] of Object.entries(params)) {
		if (value != null) url.searchParams.set(key, value)
	}
	return url
}

describe("integration/api policies resolve ratePlan-first", () => {
	const previousRulesUiEnabled = process.env.RULES_UI_ENABLED
	const previousPublicRulesUiEnabled = process.env.PUBLIC_RULES_UI_ENABLED

	beforeAll(() => {
		process.env.RULES_UI_ENABLED = "0"
		process.env.PUBLIC_RULES_UI_ENABLED = "0"
	})

	afterAll(() => {
		if (previousRulesUiEnabled == null) delete process.env.RULES_UI_ENABLED
		else process.env.RULES_UI_ENABLED = previousRulesUiEnabled
		if (previousPublicRulesUiEnabled == null) delete process.env.PUBLIC_RULES_UI_ENABLED
		else process.env.PUBLIC_RULES_UI_ENABLED = previousPublicRulesUiEnabled
	})

	defineRatePlanFirstTestSuite({
		suiteName: "api/policies/resolve ratePlan-first invariants",
		seedContext: seedRatePlanContext,
		execute: async (input) => {
			const response = await resolvePoliciesGet({
				url: makeUrl({
					productId: input.productId,
					variantId: input.variantId,
					ratePlanId: input.ratePlanId,
					checkIn: "2031-06-10",
					checkOut: "2031-06-12",
				}),
				cookies: createCookiesStub(),
			} as any)
			return response
		},
		extractResolvedContext: (body) => ({
			productId: body?.productId,
			variantId: body?.variantId,
			ratePlanId: body?.ratePlanId,
		}),
		expectedMissingContext: {
			status: 400,
			body: { error: "ratePlanId_required" },
		},
		expectedRatePlanNotFound: {
			status: 404,
			body: { error: "ratePlan_not_found" },
		},
	})

	it("solo variantId ya no es válido en modo canónico", async () => {
		const seeded = await seedRatePlanContext()
		const response = await resolvePoliciesGet({
			url: makeUrl({
				variantId: seeded.variantId,
				checkIn: "2031-06-10",
				checkOut: "2031-06-12",
			}),
			cookies: createCookiesStub(),
		} as any)
		const payload = await response.json().catch(() => ({}))
		expect(response.status).toBe(400)
		expect(payload).toEqual({ error: "ratePlanId_required" })
	})

	it("rechaza rango inválido cuando checkOut <= checkIn", async () => {
		const seeded = await seedRatePlanContext()
		const response = await resolvePoliciesGet({
			url: makeUrl({
				ratePlanId: seeded.ratePlanId,
				checkIn: "2031-06-12",
				checkOut: "2031-06-10",
			}),
			cookies: createCookiesStub(),
		} as any)
		const payload = await response.json().catch(() => ({}))
		expect(response.status).toBe(400)
		expect(payload).toEqual({ error: "invalid_stay_range" })
	})
})
