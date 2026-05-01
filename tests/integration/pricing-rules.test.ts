import { describe, it, expect } from "vitest"

import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

import { POST as createRuleV2Post } from "@/pages/api/pricing/rules/v2/create"
import { GET as listRulesV2Get } from "@/pages/api/pricing/rules/v2/list"
import { POST as previewRulesV2Post } from "@/pages/api/pricing/rules/v2/preview"
import { POST as createLegacyRulePost } from "@/pages/api/pricing/rule"

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
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(params.body),
	})
}

function makeAuthedGetRequest(params: { path: string; token?: string }): Request {
	const headers = new Headers()
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${params.path}`, { method: "GET", headers })
}

function makeAuthedFormRequest(params: {
	path: string
	token?: string
	form: Record<string, string>
}): Request {
	const headers = new Headers()
	if (params.token)
		headers.set("cookie", `sb-access-token=${encodeURIComponent(params.token)}; sb-refresh-token=r`)
	const formData = new FormData()
	for (const [key, value] of Object.entries(params.form)) formData.set(key, value)
	return new Request(`http://localhost:4321${params.path}`, {
		method: "POST",
		headers,
		body: formData,
	})
}

async function readJson(res: Response) {
	const txt = await res.text()
	return txt ? JSON.parse(txt) : null
}

async function seedRulesFixture(params?: { ownerEmail?: string }) {
	const suffix = crypto.randomUUID()
	const ownerEmail = params?.ownerEmail ?? `rules-${suffix}@example.com`
	const providerId = `prov_rules_${suffix}`
	const destinationId = `dest_rules_${suffix}`
	const productId = `prod_rules_${suffix}`
	const variantId = `var_rules_${suffix}`
	const ratePlanTemplateId = `rpt_rules_${suffix}`
	const ratePlanId = `rp_rules_${suffix}`

	await upsertDestination({
		id: destinationId,
		name: "Rules Dest",
		type: "city",
		country: "CL",
		slug: `rules-dest-${suffix}`,
	})
	await upsertProvider({ id: providerId, displayName: "Rules Provider", ownerEmail })
	await upsertProduct({
		id: productId,
		name: "Rules Hotel",
		productType: "Hotel",
		destinationId,
		providerId,
	})
	await upsertVariant({
		id: variantId,
		productId,
		kind: "hotel_room",
		name: "Room",
		baseRateCurrency: "USD",
		baseRatePrice: 100,
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

	return { ownerEmail, ratePlanId }
}

describe("integration/pricing rules (rules v2, ratePlan-first)", () => {
	it("create rule + list rules + preview reflects ratePlan context", async () => {
		const token = "t_pr_rules_ok"
		const seeded = await seedRulesFixture({ ownerEmail: "rules-ok@example.com" })

		await withSupabaseAuthStub(
			{ [token]: { id: "u_rules_ok", email: seeded.ownerEmail } },
			async () => {
				const createRes = await createRuleV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/create",
						token,
						body: {
							ratePlanId: seeded.ratePlanId,
							type: "percentage",
							value: 10,
							priority: 10,
						},
					}),
				} as any)
				expect(createRes.status).toBe(201)
				const created = (await readJson(createRes)) as any
				expect(typeof created?.ruleId).toBe("string")

				const listPath = `/api/pricing/rules/v2/list?ratePlanId=${encodeURIComponent(seeded.ratePlanId)}`
				const listRes = await listRulesV2Get({
					request: makeAuthedGetRequest({ path: listPath, token }),
					url: new URL(`http://localhost:4321${listPath}`),
				} as any)
				expect(listRes.status).toBe(200)
				const listBody = (await readJson(listRes)) as any
				expect(Array.isArray(listBody?.rules)).toBe(true)
				expect(listBody.rules.some((rule: any) => String(rule.id) === String(created.ruleId))).toBe(
					true
				)

				const previewRes = await previewRulesV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/preview",
						token,
						body: {
							ratePlanId: seeded.ratePlanId,
							type: "percentage",
							value: 10,
							priority: 10,
							previewFrom: "2032-01-01",
							previewDays: 3,
						},
					}),
				} as any)
				expect(previewRes.status).toBe(200)
				const previewBody = (await readJson(previewRes)) as any
				expect(previewBody?.ratePlanId).toBe(seeded.ratePlanId)
				expect(Array.isArray(previewBody?.days)).toBe(true)
				expect(previewBody.days.length).toBe(3)
				expect(previewBody.days.every((d: any) => Number(d.after) >= Number(d.before))).toBe(true)
			}
		)
	})

	it("legacy mutation endpoint requires ratePlanId or explicit adapter from variantId", async () => {
		const token = "t_pr_rules_legacy"
		const seeded = await seedRulesFixture({ ownerEmail: "rules-legacy@example.com" })

		await withSupabaseAuthStub(
			{ [token]: { id: "u_rules_legacy", email: seeded.ownerEmail } },
			async () => {
				const badRes = await createLegacyRulePost({
					request: makeAuthedFormRequest({
						path: "/api/pricing/rule",
						token,
						form: {
							type: "percentage",
							value: "10",
						},
					}),
				} as any)
				expect(badRes.status).toBe(400)
				const badBody = (await readJson(badRes)) as any
				expect(String(badBody?.error ?? "")).toContain("ratePlanId is required")

				const okRes = await createLegacyRulePost({
					request: makeAuthedFormRequest({
						path: "/api/pricing/rule",
						token,
						form: {
							ratePlanId: seeded.ratePlanId,
							type: "percentage",
							value: "10",
						},
					}),
				} as any)
				expect(okRes.status).toBe(201)
				const okBody = (await readJson(okRes)) as any
				expect(Array.isArray(okBody?.warnings)).toBe(true)
				expect(okBody.warnings.length).toBe(0)
			}
		)
	})

	it("ownership violation => 404", async () => {
		const tokenOwner = "t_pr_rules_oa"
		const tokenOther = "t_pr_rules_ob"
		const seeded = await seedRulesFixture({ ownerEmail: "rules-oa@example.com" })
		await upsertProvider({
			id: `prov_rules_other_${crypto.randomUUID()}`,
			displayName: "Rules Other Provider",
			ownerEmail: "rules-ob@example.com",
		})

		await withSupabaseAuthStub(
			{
				[tokenOwner]: { id: "u_rules_oa", email: seeded.ownerEmail },
				[tokenOther]: { id: "u_rules_ob", email: "rules-ob@example.com" },
			},
			async () => {
				const res = await createRuleV2Post({
					request: makeAuthedJsonRequest({
						path: "/api/pricing/rules/v2/create",
						token: tokenOther,
						body: {
							ratePlanId: seeded.ratePlanId,
							type: "percentage",
							value: 10,
							priority: 10,
						},
					}),
				} as any)
				expect(res.status).toBe(404)
			}
		)
	})
})
