import { afterEach, describe, expect, it, vi } from "vitest"

import { POST as assignPolicyPost } from "@/pages/api/policies/assign"
import { GET as assignmentOptionsGet } from "@/pages/api/policies/assignment-options"
import { POST as previewPolicyPost } from "@/pages/api/policies/preview"
import { createPolicyCapa6 } from "@/modules/policies/public"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertRatePlan,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
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

function request(token: string, body: Record<string, unknown>) {
	return new Request("http://localhost:4321/api/policies/assign", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"cookie": `sb-access-token=${token}; sb-refresh-token=r`,
		},
		body: JSON.stringify(body),
	})
}

function getRequest(token: string, path: string) {
	return new Request(`http://localhost:4321${path}`, {
		method: "GET",
		headers: { cookie: `sb-access-token=${token}; sb-refresh-token=r` },
	})
}

describe("tour policy assignment: existing payment", () => {
	it("reuses provider-at-experience payment instead of rejecting its stored paymentType rule", async () => {
		const suffix = crypto.randomUUID()
		const token = `tour_payment_${suffix}`
		const email = `tour-payment-${suffix}@example.com`
		const providerId = `prov_tour_payment_${suffix}`
		const geoPlaceId = `dest_tour_payment_${suffix}`
		const productId = `prod_tour_payment_${suffix}`
		const variantId = `variant_tour_payment_${suffix}`
		const ratePlanId = `rate_tour_payment_${suffix}`

		await upsertGeoPlace({
			id: geoPlaceId,
			canonicalName: "Destino de prueba",
			placeType: "city",
			countryCode: "BO",
			slug: `tour-payment-${suffix}`,
		})
		await upsertProvider({ id: providerId, displayName: "Operador de prueba", ownerEmail: email })
		await upsertProduct({
			id: productId,
			name: "Experiencia de prueba",
			productType: "Tour",
			geoPlaceId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "tour_slot",
			name: "Salida compartida",
			isActive: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			variantId,
			name: "Tarifa de prueba",
			isActive: true,
			isDefault: true,
		})
		const payment = await createPolicyCapa6({
			ownerProviderId: providerId,
			category: "Payment",
			description: "Pago al proveedor durante la experiencia",
			rules: { paymentType: "pay_at_property" },
		})
		const incompatibleExisting = await createPolicyCapa6({
			ownerProviderId: providerId,
			category: "Cancellation",
			description: "Política histórica hotelera que un tour no puede reutilizar",
			policyPresetKey: "long_term",
		})
		installAuth(token, { id: `remote_${suffix}`, email })

		const response = await assignPolicyPost({
			request: request(token, {
				mode: "existing",
				policyId: payment.policyId,
				scope: "rate_plan",
				scopeId: ratePlanId,
			}),
		} as any)

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual(
			expect.objectContaining({ success: true, policyId: payment.policyId })
		)

		const tourPaymentPreview = await previewPolicyPost({
			request: request(token, {
				mode: "existing",
				policyId: payment.policyId,
				scope: "rate_plan",
				scopeId: ratePlanId,
				grossAmount: 1000,
			}),
		} as any)
		expect(tourPaymentPreview.status).toBe(200)
		const tourPreviewPayload = await tourPaymentPreview.json()
		expect(tourPreviewPayload.quotes).toBeNull()
		expect(tourPreviewPayload.previewContext).toEqual(expect.objectContaining({ quote: "missing" }))
		expect(tourPreviewPayload.preview.map((item: { value: string }) => item.value)).toEqual(
			expect.arrayContaining([
				"Paga al proveedor al realizar el tour",
				"Fastt no cobra, custodia ni reembolsa este pago.",
			])
		)

		const optionsResponse = await assignmentOptionsGet({
			request: getRequest(
				token,
				`/api/policies/assignment-options?scope=rate_plan&scopeId=${ratePlanId}`
			),
			url: new URL(
				`http://localhost:4321/api/policies/assignment-options?scope=rate_plan&scopeId=${ratePlanId}`
			),
		} as any)
		expect(optionsResponse.status).toBe(200)
		const options = await optionsResponse.json()
		expect(options.context).toEqual(
			expect.objectContaining({
				business: "tour",
				allowedCategories: ["Cancellation", "Payment", "NoShow"],
			})
		)
		expect(options.presets.map((preset: { key: string }) => preset.key)).toEqual(
			expect.arrayContaining([
				"tour_flexible_24h",
				"tour_non_refundable",
				"pay_at_property",
				"no_show_percentage_100",
			])
		)
		expect(options.presets.map((preset: { key: string }) => preset.key)).not.toEqual(
			expect.arrayContaining(["long_term", "prepayment_full", "no_show_first_night"])
		)

		const previewResponse = await previewPolicyPost({
			request: request(token, {
				mode: "preset",
				category: "Cancellation",
				policyPresetKey: "long_term",
				scope: "rate_plan",
				scopeId: ratePlanId,
			}),
		} as any)
		expect(previewResponse.status).toBe(409)
		expect(await previewResponse.json()).toEqual(
			expect.objectContaining({ error: "tour_stay_length_policy_not_supported" })
		)

		const existingPreviewResponse = await previewPolicyPost({
			request: request(token, {
				mode: "existing",
				policyId: incompatibleExisting.policyId,
				scope: "rate_plan",
				scopeId: ratePlanId,
			}),
		} as any)
		expect(existingPreviewResponse.status).toBe(409)
		expect(await existingPreviewResponse.json()).toEqual(
			expect.objectContaining({ error: "tour_stay_length_policy_not_supported" })
		)

		const presetResponse = await assignPolicyPost({
			request: request(token, {
				mode: "preset",
				category: "Cancellation",
				policyPresetKey: "long_term",
				scope: "rate_plan",
				scopeId: ratePlanId,
			}),
		} as any)
		expect(presetResponse.status).toBe(409)
		expect(await presetResponse.json()).toEqual(
			expect.objectContaining({ error: "tour_stay_length_policy_not_supported" })
		)

		const existingResponse = await assignPolicyPost({
			request: request(token, {
				mode: "existing",
				policyId: incompatibleExisting.policyId,
				scope: "rate_plan",
				scopeId: ratePlanId,
			}),
		} as any)
		expect(existingResponse.status).toBe(409)
		expect(await existingResponse.json()).toEqual(
			expect.objectContaining({ error: "tour_stay_length_policy_not_supported" })
		)

		const draftPreviewResponse = await previewPolicyPost({
			request: request(token, {
				mode: "draft",
				category: "NoShow",
				rules: { penaltyType: "first_night" },
				scope: "rate_plan",
				scopeId: ratePlanId,
			}),
		} as any)
		expect(draftPreviewResponse.status).toBe(409)
		expect(await draftPreviewResponse.json()).toEqual(
			expect.objectContaining({ error: "tour_no_show_basis_not_supported" })
		)

		const noShowResponse = await assignPolicyPost({
			request: request(token, {
				mode: "draft",
				category: "NoShow",
				rules: { penaltyType: "first_night" },
				scope: "rate_plan",
				scopeId: ratePlanId,
			}),
		} as any)
		expect(noShowResponse.status).toBe(409)
		expect(await noShowResponse.json()).toEqual(
			expect.objectContaining({ error: "tour_no_show_basis_not_supported" })
		)
	})
})
