import { describe, expect, it } from "vitest"

import { POST as createCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/create"
import { GET as getCancellationPoliciesGet } from "@/pages/api/products/[id]/cancellation-policies/get"
import { POST as updateCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/update"
import { POST as toggleCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/toggle"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
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

function authedJsonRequest(path: string, token: string, body: Record<string, unknown>) {
	const headers = new Headers({ "Content-Type": "application/json" })
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${path}`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	})
}

function authedGetRequest(path: string, token: string) {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${path}`, { method: "GET", headers })
}

function readJson<T = any>(res: Response): Promise<T> {
	return res.text().then((txt) => (txt ? JSON.parse(txt) : ({} as T)))
}

function expectLegacyCancellationNotice(res: Response, body: any, successor: string) {
	expect(res.headers.get("Deprecation")).toBe("true")
	expect(res.headers.get("Sunset")).toBe("Tue, 30 Jun 2026 23:59:59 GMT")
	expect(res.headers.get("Warning")).toContain("Deprecated endpoint")
	expect(res.headers.get("Link")).toBe(`<${successor}>; rel="successor-version"`)
	expect(res.headers.get("X-Fastt-Compatibility")).toBe("cancellation-policies-capa6-bridge")
	expect(body.deprecated).toBe(true)
	expect(body.compatibilityMode).toBe("capa6_bridge")
	expect(body.migration?.successor).toBe(successor)
	expect(body.migration?.sunset).toBe("2026-06-30")
}

describe("integration/policies cancellation endpoints (CAPA6 wiring)", () => {
	it("supports create -> get -> update -> toggle flow with consistent reads", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `prov_pol_ep_${suffix}`
		const email = `pol-ep-${suffix}@example.test`
		const token = `token_${suffix}`
		const destinationId = `dest_pol_ep_${suffix}`
		const productId = `prod_pol_ep_${suffix}`

		await upsertProvider({
			id: providerId,
			legalName: "Policies EP Provider",
			ownerEmail: email,
		})
		await upsertDestination({
			id: destinationId,
			name: "Policies EP Destination",
			type: "city",
			country: "CL",
			slug: `pol-ep-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Policies EP Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		await withSupabaseAuthStub({ [token]: { id: `user_${email}`, email } }, async () => {
			const createRes = await createCancellationPolicyPost({
				params: { id: productId },
				request: authedJsonRequest(
					`/api/products/${productId}/cancellation-policies/create`,
					token,
					{
						name: "Flexible",
						tiers: [{ daysBeforeArrival: 3, penaltyType: "percentage", penaltyAmount: 100 }],
					}
				),
			} as any)
			expect(createRes.status).toBe(200)
			const createBody = await readJson<{ success: boolean; id: string; groupId: string }>(
				createRes
			)
			expectLegacyCancellationNotice(createRes, createBody, "/api/policies/create")
			expect(createBody.success).toBe(true)
			expect(typeof createBody.id).toBe("string")
			expect(typeof createBody.groupId).toBe("string")

			const getRes1 = await getCancellationPoliciesGet({
				params: { id: productId },
				request: authedGetRequest(`/api/products/${productId}/cancellation-policies/get`, token),
			} as any)
			expect(getRes1.status).toBe(200)
			const getBody1 = await readJson<{ policies: Array<any> }>(getRes1)
			expectLegacyCancellationNotice(getRes1, getBody1, "/api/policies/[id]")
			expect(Array.isArray(getBody1.policies)).toBe(true)
			expect(getBody1.policies.length).toBeGreaterThan(0)
			const latest1 = getBody1.policies[0]
			expect(latest1.groupId).toBe(createBody.groupId)
			expect(latest1.version).toBe(1)
			expect(latest1.isActive).toBe(true)
			expect(typeof latest1.assignmentId).toBe("string")

			const updateRes = await updateCancellationPolicyPost({
				request: authedJsonRequest(
					`/api/products/${productId}/cancellation-policies/update`,
					token,
					{
						groupId: createBody.groupId,
						name: "Flexible v2",
						tiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
					}
				),
			} as any)
			expect(updateRes.status).toBe(200)
			const updateBody = await readJson<{ success: boolean; groupId: string; version: number }>(
				updateRes
			)
			expectLegacyCancellationNotice(updateRes, updateBody, "/api/policies/create-version")
			expect(updateBody.success).toBe(true)
			expect(updateBody.groupId).toBe(createBody.groupId)
			expect(updateBody.version).toBe(2)

			const getRes2 = await getCancellationPoliciesGet({
				params: { id: productId },
				request: authedGetRequest(`/api/products/${productId}/cancellation-policies/get`, token),
			} as any)
			const getBody2 = await readJson<{ policies: Array<any> }>(getRes2)
			expectLegacyCancellationNotice(getRes2, getBody2, "/api/policies/[id]")
			expect(getBody2.policies.length).toBeGreaterThan(0)
			const latest2 = getBody2.policies[0]
			expect(latest2.groupId).toBe(createBody.groupId)
			expect(latest2.version).toBe(2)

			const toggleRes = await toggleCancellationPolicyPost({
				request: authedJsonRequest(
					`/api/products/${productId}/cancellation-policies/toggle`,
					token,
					{ assignmentId: latest2.assignmentId, isActive: false }
				),
			} as any)
			expect(toggleRes.status).toBe(200)
			const toggleBody = await readJson<{ success: boolean }>(toggleRes)
			expectLegacyCancellationNotice(toggleRes, toggleBody, "/provider/policies")
			expect(toggleBody.success).toBe(true)

			const getRes3 = await getCancellationPoliciesGet({
				params: { id: productId },
				request: authedGetRequest(`/api/products/${productId}/cancellation-policies/get`, token),
			} as any)
			const getBody3 = await readJson<{ policies: Array<any> }>(getRes3)
			expectLegacyCancellationNotice(getRes3, getBody3, "/api/policies/[id]")
			expect(getBody3.policies.length).toBeGreaterThan(0)
			expect(getBody3.policies[0].isActive).toBe(false)
		})
	})
})
