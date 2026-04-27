import { describe, expect, it } from "vitest"

import { GET as listRatePlansGet } from "@/pages/api/rates/plans"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
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

function makeAuthedGetRequest(params: { path: string; token?: string }): Request {
	const headers = new Headers()
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	return new Request(`http://localhost:4321${params.path}`, {
		method: "GET",
		headers,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

async function seedProviderRatePlan(params: {
	suffix: string
	providerId: string
	email: string
	productName: string
	variantName: string
	ratePlanName: string
}) {
	const destinationId = `dest_rates_plans_${params.suffix}`
	const productId = `prod_rates_plans_${params.suffix}`
	const variantId = `var_rates_plans_${params.suffix}`
	const templateId = `rpt_rates_plans_${params.suffix}`
	const ratePlanId = `rp_rates_plans_${params.suffix}`

	await upsertDestination({
		id: destinationId,
		name: `Destino ${params.suffix}`,
		type: "city",
		country: "CL",
		slug: `rates-plans-${params.suffix}`,
	})
	await upsertProvider({
		id: params.providerId,
		displayName: `Provider ${params.suffix}`,
		ownerEmail: params.email,
	})
	await upsertProduct({
		id: productId,
		name: params.productName,
		productType: "Hotel",
		destinationId,
		providerId: params.providerId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: params.variantName,
		isActive: true,
	})
	await upsertRatePlanTemplate({
		id: templateId,
		name: params.ratePlanName,
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlan({
		id: ratePlanId,
		templateId,
		variantId,
		isActive: true,
		isDefault: true,
	})

	return { ratePlanId, variantId }
}

describe("integration/api rates plans", () => {
	it("listado básico: retorna read model optimizado para UI", async () => {
		const suffix = crypto.randomUUID()
		const token = `t_rates_plans_${suffix}`
		const email = `rates-plans-${suffix}@example.com`
		const providerId = `prov_rates_plans_${suffix}`
		const seeded = await seedProviderRatePlan({
			suffix,
			providerId,
			email,
			productName: "Hotel Central",
			variantName: "Habitación Standard",
			ratePlanName: "Tarifa Flexible",
		})

		await withSupabaseAuthStub({ [token]: { id: "u_rates_plans", email } }, async () => {
			const response = await listRatePlansGet({
				request: makeAuthedGetRequest({ path: "/api/rates/plans", token }),
			} as any)
			expect(response.status).toBe(200)
			const body = await readJson(response)

			expect(Array.isArray(body?.ratePlans)).toBe(true)
			expect(body.ratePlans.length).toBeGreaterThan(0)
			expect(body.ratePlans).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						ratePlanId: seeded.ratePlanId,
						ratePlanName: "Tarifa Flexible",
						productName: "Hotel Central",
						variantName: "Habitación Standard",
						isActive: true,
						isDefault: true,
						status: "active",
						summary: expect.objectContaining({
							priceRulesCount: expect.any(Number),
							activeRestrictionsCount: expect.any(Number),
						}),
						policyCoverage: expect.objectContaining({
							totalCategories: 4,
							coveredCategories: expect.any(Number),
							missingCategories: expect.any(Array),
							isComplete: expect.any(Boolean),
						}),
						policySummary: expect.any(String),
					}),
				])
			)
		})
	})

	it("aislamiento por provider: solo devuelve rate plans del proveedor autenticado", async () => {
		const suffix = crypto.randomUUID()
		const tokenA = `t_rates_plans_a_${suffix}`
		const tokenB = `t_rates_plans_b_${suffix}`
		const emailA = `rates-plans-a-${suffix}@example.com`
		const emailB = `rates-plans-b-${suffix}@example.com`
		const providerA = `prov_rates_plans_a_${suffix}`
		const providerB = `prov_rates_plans_b_${suffix}`

		const seededA = await seedProviderRatePlan({
			suffix: `a_${suffix}`,
			providerId: providerA,
			email: emailA,
			productName: "Hotel A",
			variantName: "Room A",
			ratePlanName: "Plan A",
		})
		const seededB = await seedProviderRatePlan({
			suffix: `b_${suffix}`,
			providerId: providerB,
			email: emailB,
			productName: "Hotel B",
			variantName: "Room B",
			ratePlanName: "Plan B",
		})

		await withSupabaseAuthStub(
			{
				[tokenA]: { id: "u_rates_plans_a", email: emailA },
				[tokenB]: { id: "u_rates_plans_b", email: emailB },
			},
			async () => {
				const responseA = await listRatePlansGet({
					request: makeAuthedGetRequest({ path: "/api/rates/plans", token: tokenA }),
				} as any)
				expect(responseA.status).toBe(200)
				const bodyA = await readJson(responseA)
				expect(Array.isArray(bodyA?.ratePlans)).toBe(true)
				expect(bodyA.ratePlans.some((item: any) => item.ratePlanId === seededA.ratePlanId)).toBe(
					true
				)
				expect(bodyA.ratePlans.some((item: any) => item.ratePlanId === seededB.ratePlanId)).toBe(
					false
				)
			}
		)
	})
})
