import { describe, expect, it } from "vitest"

import { POST as bulkApplyPost } from "@/pages/api/pricing/rules/v2/bulk-apply"
import { POST as bulkPreviewPost } from "@/pages/api/pricing/rules/v2/bulk-preview"
import { GET as listRulesV2Get } from "@/pages/api/pricing/rules/v2/list"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { buildOccupancyKey } from "@/shared/domain/occupancy"
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

async function seedBulkFixture() {
	const suffix = crypto.randomUUID()
	const token = `t_pr_v2_bulk_${suffix}`
	const email = `pr-v2-bulk-${suffix}@example.com`
	const providerId = `prov_pr_v2_bulk_${suffix}`
	const destinationId = `dest_pr_v2_bulk_${suffix}`
	const productId = `prod_pr_v2_bulk_${suffix}`
	const variantAId = `var_pr_v2_bulk_a_${suffix}`
	const variantBId = `var_pr_v2_bulk_b_${suffix}`
	const templateAId = `rpt_pr_v2_bulk_a_${suffix}`
	const templateBId = `rpt_pr_v2_bulk_b_${suffix}`
	const ratePlanAId = `rp_pr_v2_bulk_a_${suffix}`
	const ratePlanBId = `rp_pr_v2_bulk_b_${suffix}`

	await upsertDestination({
		id: destinationId,
		name: "Pricing V2 Bulk Dest",
		type: "city",
		country: "CL",
		slug: `pricing-v2-bulk-${suffix}`,
	})
	await upsertProvider({
		id: providerId,
		displayName: "Pricing V2 Bulk Provider",
		ownerEmail: email,
	})
	await upsertProduct({
		id: productId,
		name: "Pricing V2 Bulk Product",
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

	return { token, email, ratePlanAId, ratePlanBId }
}

describe("integration/pricing rules v2 bulk orchestration", () => {
	it("bulk endpoints validan payload mínimo", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_bulk_validation", email: fixture.email } },
			async () => {
				const response = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body: {
							ratePlanIds: [],
							operation: { type: "percentage", value: 10 },
						},
					}),
				} as any)
				expect(response.status).toBe(400)
				const payload = await readJson(response)
				expect(payload?.error).toBe("validation_error")
			}
		)
	})

	it("preview determinista para mismo input", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_bulk_det", email: fixture.email } },
			async () => {
				const body = {
					ratePlanIds: [fixture.ratePlanAId, fixture.ratePlanBId],
					operation: { type: "percentage", value: 10, conditions: { previewDays: 5 } },
					concurrency: 2,
				}
				const response1 = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body,
					}),
				} as any)
				expect(response1.status).toBe(200)
				const payload1 = await readJson(response1)

				const response2 = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body,
					}),
				} as any)
				expect(response2.status).toBe(200)
				const payload2 = await readJson(response2)

				expect(payload1).toEqual(payload2)
				expect(payload1?.results?.[0]?.preview?.dateRange?.from).toBeTypeOf("string")
				expect(payload1?.results?.[0]?.preview?.dateRange?.to).toBeTypeOf("string")
				expect(payload1?.results?.[0]?.preview?.priceSummary?.before?.avg).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.preview?.priceSummary?.after?.avg).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.preview?.breakdown?.daysWithoutCoverage).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.businessMetrics?.averageNightlyChange).toBeTypeOf("number")
				expect(payload1?.results?.[0]?.preview?.days?.[0]?.dayOfWeekLabel).toBeTypeOf("string")
			}
		)
	})

	it("maneja fallos parciales sin romper lote", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_bulk_partial", email: fixture.email } },
			async () => {
				const response = await bulkPreviewPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-preview",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId, `missing_${crypto.randomUUID()}`],
							operation: { type: "percentage", value: 8 },
							concurrency: 2,
						},
					}),
				} as any)
				expect(response.status).toBe(200)
				const payload = await readJson(response)
				expect(payload?.summary?.total).toBe(2)
				expect(payload?.summary?.success).toBe(1)
				expect(payload?.summary?.failed).toBe(1)
				expect(Array.isArray(payload?.failures)).toBe(true)
				expect(payload.failures[0]?.ratePlanId).toContain("missing_")
			}
		)
	})

	it("apply mantiene aislamiento entre ratePlans", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_bulk_iso", email: fixture.email } },
			async () => {
				const applyResponse = await bulkApplyPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-apply",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId],
							operation: { type: "percentage", value: 15, conditions: { effectiveDays: 7 } },
						},
					}),
				} as any)
				expect(applyResponse.status).toBe(200)
				const applyPayload = await readJson(applyResponse)
				expect(applyPayload?.summary?.success).toBe(1)
				expect(applyPayload?.summary?.failed).toBe(0)

				const listA = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				const listABody = await readJson(listA)

				const listB = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanBId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanBId)}`
					),
				} as any)
				const listBBody = await readJson(listB)

				expect(Array.isArray(listABody?.rules)).toBe(true)
				expect(listABody.rules.length).toBeGreaterThan(0)
				expect(Array.isArray(listBBody?.rules)).toBe(true)
				expect(listBBody.rules.length).toBe(0)
			}
		)
	})

	it("consistencia: apply devuelve resultados trazables por ratePlan", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_bulk_cons", email: fixture.email } },
			async () => {
				const response = await bulkApplyPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-apply",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId, fixture.ratePlanBId],
							operation: { type: "fixed_adjustment", value: 7, conditions: { effectiveDays: 5 } },
							concurrency: 2,
						},
					}),
				} as any)
				expect(response.status).toBe(200)
				const payload = await readJson(response)
				expect(payload?.summary?.total).toBe(2)
				expect(payload?.summary?.success).toBe(2)
				expect(payload?.summary?.failed).toBe(0)
				expect(Array.isArray(payload?.results)).toBe(true)
				expect(payload.results.every((item: any) => typeof item.ratePlanId === "string")).toBe(true)
				expect(
					payload.results.every(
						(item: any) => typeof item.ruleId === "string" && item.ruleId.length > 0
					)
				).toBe(true)
				expect(payload.results.every((item: any) => Number(item.daysGenerated) > 0)).toBe(true)
			}
		)
	})

	it("dryRun no persiste reglas nuevas", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_bulk_dry", email: fixture.email } },
			async () => {
				const beforeList = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				const beforePayload = await readJson(beforeList)
				const beforeCount = Array.isArray(beforePayload?.rules) ? beforePayload.rules.length : 0

				const applyResponse = await bulkApplyPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-apply",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId],
							operation: { type: "percentage", value: 12, conditions: { effectiveDays: 5 } },
							dryRun: true,
						},
					}),
				} as any)
				expect(applyResponse.status).toBe(200)
				const applyPayload = await readJson(applyResponse)
				expect(applyPayload?.dryRun).toBe(true)

				const afterList = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				const afterPayload = await readJson(afterList)
				const afterCount = Array.isArray(afterPayload?.rules) ? afterPayload.rules.length : 0
				expect(afterCount).toBe(beforeCount)
			}
		)
	})

	it("bulk apply soporta reglas segmentadas por occupancyKey sin romper reglas globales", async () => {
		const fixture = await seedBulkFixture()
		await withSupabaseAuthStub(
			{ [fixture.token]: { id: "u_pr_v2_bulk_occ", email: fixture.email } },
			async () => {
				const globalApplyResponse = await bulkApplyPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-apply",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId],
							operation: { type: "fixed_adjustment", value: 5, conditions: { effectiveDays: 5 } },
						},
					}),
				} as any)
				expect(globalApplyResponse.status).toBe(200)

				const scopedApplyResponse = await bulkApplyPost({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/bulk-apply",
						token: fixture.token,
						body: {
							ratePlanIds: [fixture.ratePlanAId],
							operation: {
								type: "percentage_markup",
								value: 10,
								conditions: {
									effectiveDays: 5,
									occupancyKey: buildOccupancyKey({ adults: 3, children: 0, infants: 0 }),
								},
							},
						},
					}),
				} as any)
				expect(scopedApplyResponse.status).toBe(200)
				const scopedPayload = await readJson(scopedApplyResponse)
				expect(scopedPayload?.summary?.success).toBe(1)
				expect(scopedPayload?.summary?.failed).toBe(0)

				const listResponse = await listRulesV2Get({
					request: makeAuthedGetRequest({
						path: `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`,
						token: fixture.token,
					}),
					url: new URL(
						`http://localhost:4321/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(fixture.ratePlanAId)}`
					),
				} as any)
				expect(listResponse.status).toBe(200)
				const listPayload = await readJson(listResponse)
				const rules = Array.isArray(listPayload?.rules) ? listPayload.rules : []
				expect(rules.length).toBeGreaterThanOrEqual(2)
				expect(rules.some((rule: any) => rule.occupancyKey === null)).toBe(true)
				expect(
					rules.some(
						(rule: any) =>
							rule.occupancyKey === buildOccupancyKey({ adults: 3, children: 0, infants: 0 })
					)
				).toBe(true)
			}
		)
	})
})
