import { describe, expect, it } from "vitest"
import { and, db, EffectivePricing, eq } from "astro:db"

import { POST as createRuleV2Post } from "@/pages/api/pricing/rules/v2/create"
import { POST as updateRuleV2Post } from "@/pages/api/pricing/rules/v2/update"
import { POST as deleteRuleV2Post } from "@/pages/api/pricing/rules/v2/delete"
import { GET as listRulesV2Get } from "@/pages/api/pricing/rules/v2/list"
import { POST as previewRulesV2Post } from "@/pages/api/pricing/rules/v2/preview"
import { POST as generateEffectiveV2Post } from "@/pages/api/pricing/rules/v2/generate-effective"

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

function makeAuthedJsonRequest(params: {
	path: string
	token?: string
	body: Record<string, unknown>
}) {
	const headers = new Headers({ "Content-Type": "application/json" })
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(params.body),
	})
}

function makeAuthedGetRequest(params: { path: string; token?: string }) {
	const headers = new Headers()
	if (params.token) {
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	}
	return new Request(`http://localhost:4321${params.path}`, { method: "GET", headers })
}

async function readJson(response: Response) {
	const text = await response.text()
	return text ? JSON.parse(text) : null
}

function addDays(dateOnly: string, days: number): string {
	const date = new Date(`${dateOnly}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

async function seedRatePlanV2Fixture() {
	const suffix = crypto.randomUUID()
	const token = `t_pr_v2_${suffix}`
	const email = `pr-v2-${suffix}@example.com`
	const providerId = `prov_pr_v2_${suffix}`
	const destinationId = `dest_pr_v2_${suffix}`
	const productId = `prod_pr_v2_${suffix}`
	const variantAId = `var_pr_v2_a_${suffix}`
	const variantBId = `var_pr_v2_b_${suffix}`
	const templateAId = `rpt_pr_v2_a_${suffix}`
	const templateBId = `rpt_pr_v2_b_${suffix}`
	const ratePlanAId = `rp_pr_v2_a_${suffix}`
	const ratePlanBId = `rp_pr_v2_b_${suffix}`

	await upsertDestination({
		id: destinationId,
		name: "Pricing V2 Dest",
		type: "city",
		country: "CL",
		slug: `pricing-v2-${suffix}`,
	})
	await upsertProvider({ id: providerId, displayName: "Pricing V2 Provider", ownerEmail: email })
	await upsertProduct({
		id: productId,
		name: "Pricing V2 Product",
		productType: "Hotel",
		destinationId,
		providerId,
	})
	await upsertVariant({
		id: variantAId,
		productId,
		kind: "hotel_room",
		name: "Habitación A",
		baseRateCurrency: "USD",
		baseRatePrice: 100,
	})
	await upsertVariant({
		id: variantBId,
		productId,
		kind: "hotel_room",
		name: "Habitación B",
		baseRateCurrency: "USD",
		baseRatePrice: 120,
	})
	await upsertRatePlanTemplate({
		id: templateAId,
		name: "Default A",
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlanTemplate({
		id: templateBId,
		name: "Default B",
		paymentType: "prepaid",
		refundable: false,
	})
	await upsertRatePlan({
		id: ratePlanAId,
		templateId: templateAId,
		variantId: variantAId,
		isActive: true,
		isDefault: true,
	})
	await upsertRatePlan({
		id: ratePlanBId,
		templateId: templateBId,
		variantId: variantBId,
		isActive: true,
		isDefault: true,
	})

	return { token, email, productId, variantAId, variantBId, ratePlanAId, ratePlanBId }
}

describe("integration/pricing rules v2 (ratePlan-first)", () => {
	it("CRUD completo + aislamiento por ratePlan", async () => {
		const fixture = await seedRatePlanV2Fixture()

		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2", email: fixture.email } },
			async () => {
				const createA = await createRuleV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/create",
						token: fixture.token,
						body: {
							ratePlanId: fixture.ratePlanAId,
							type: "percentage",
							value: 10,
							priority: 10,
						},
					}),
				} as any)
				expect(createA.status).toBe(201)
				const createdA = await readJson(createA)
				const ruleAId = String(createdA?.ruleId ?? "")
				expect(ruleAId.length).toBeGreaterThan(0)

				const createB = await createRuleV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/create",
						token: fixture.token,
						body: {
							ratePlanId: fixture.ratePlanBId,
							type: "fixed_adjustment",
							value: 5,
							priority: 10,
						},
					}),
				} as any)
				expect(createB.status).toBe(201)
				const createdB = await readJson(createB)
				const ruleBId = String(createdB?.ruleId ?? "")
				expect(ruleBId.length).toBeGreaterThan(0)

				const listA1 = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				expect(listA1.status).toBe(200)
				const listA1Body = await readJson(listA1)
				expect(Array.isArray(listA1Body?.rules)).toBe(true)
				expect(listA1Body.rules.some((rule: any) => String(rule.id) === ruleAId)).toBe(true)
				expect(listA1Body.rules.some((rule: any) => String(rule.id) === ruleBId)).toBe(false)

				const updateA = await updateRuleV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/update",
						token: fixture.token,
						body: {
							ratePlanId: fixture.ratePlanAId,
							ruleId: ruleAId,
							type: "percentage",
							value: 20,
							priority: 10,
						},
					}),
				} as any)
				expect(updateA.status).toBe(200)

				const listA2 = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				expect(listA2.status).toBe(200)
				const listA2Body = await readJson(listA2)
				const updatedRule = listA2Body.rules.find((rule: any) => String(rule.id) === ruleAId)
				expect(Number(updatedRule?.value)).toBe(20)

				const deleteA = await deleteRuleV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/delete",
						token: fixture.token,
						body: {
							ratePlanId: fixture.ratePlanAId,
							ruleId: ruleAId,
						},
					}),
				} as any)
				expect(deleteA.status).toBe(200)

				const listA3 = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				expect(listA3.status).toBe(200)
				const listA3Body = await readJson(listA3)
				expect(listA3Body.rules.some((rule: any) => String(rule.id) === ruleAId)).toBe(false)
			}
		)
	})

	it("determinismo: mismas reglas producen mismo preview", async () => {
		const fixture = await seedRatePlanV2Fixture()
		const previewFrom = "2032-01-10"

		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_det", email: fixture.email } },
			async () => {
				const reqBody = {
					ratePlanId: fixture.ratePlanAId,
					type: "percentage",
					value: 12,
					priority: 10,
					previewFrom,
					previewDays: 5,
				}

				const preview1 = await previewRulesV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/preview",
						token: fixture.token,
						body: reqBody,
					}),
				} as any)
				expect(preview1.status).toBe(200)
				const body1 = await readJson(preview1)

				const preview2 = await previewRulesV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/preview",
						token: fixture.token,
						body: reqBody,
					}),
				} as any)
				expect(preview2.status).toBe(200)
				const body2 = await readJson(preview2)

				expect(body1).toEqual(body2)
			}
		)
	})

	it("preview vs effective: consistencia para mismo ratePlan/rango", async () => {
		const fixture = await seedRatePlanV2Fixture()
		const previewFrom = "2032-02-10"
		const previewDays = 3
		const previewToExclusive = addDays(previewFrom, previewDays)

		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_pe", email: fixture.email } },
			async () => {
				const preview = await previewRulesV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/preview",
						token: fixture.token,
						body: {
							ratePlanId: fixture.ratePlanAId,
							type: "percentage",
							value: 15,
							priority: 10,
							previewFrom,
							previewDays,
						},
					}),
				} as any)
				expect(preview.status).toBe(200)
				const previewBody = await readJson(preview)
				expect(Array.isArray(previewBody?.days)).toBe(true)
				expect(previewBody.days.length).toBe(previewDays)
				const previewFirstAfter = Number(previewBody.days[0]?.after ?? 0)

				const create = await createRuleV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/create",
						token: fixture.token,
						body: {
							ratePlanId: fixture.ratePlanAId,
							type: "percentage",
							value: 15,
							priority: 10,
						},
					}),
				} as any)
				expect(create.status).toBe(201)

				const generate = await generateEffectiveV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/generate-effective",
						token: fixture.token,
						body: {
							ratePlanId: fixture.ratePlanAId,
							from: previewFrom,
							to: previewToExclusive,
						},
					}),
				} as any)
				expect(generate.status).toBe(200)

				const effectiveRow = await db
					.select()
					.from(EffectivePricing)
					.where(
						and(
							eq(EffectivePricing.variantId, fixture.variantAId),
							eq(EffectivePricing.ratePlanId, fixture.ratePlanAId),
							eq(EffectivePricing.date, previewFrom)
						)
					)
					.get()
				expect(Number(effectiveRow?.finalBasePrice ?? 0)).toBe(previewFirstAfter)
			}
		)
	})
})
