import { describe, expect, it } from "vitest"

import { GET as getPolicyById } from "@/pages/api/policies/[id]"
import { assignPolicyCapa6, createPolicyCapa6 } from "@/modules/policies/public"
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

function authedGetRequest(path: string, token: string) {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${path}`, { method: "GET", headers })
}

async function readJson<T>(response: Response): Promise<T> {
	const text = await response.text()
	return text ? JSON.parse(text) : ({} as T)
}

describe("integration/policies read contract (CAPA6)", () => {
	it("returns policy, group category, rules, tiers and assignments for an owned policy", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `prov_policy_read_${suffix}`
		const email = `policy-read-${suffix}@example.test`
		const token = `token_${suffix}`
		const destinationId = `dest_policy_read_${suffix}`
		const productId = `prod_policy_read_${suffix}`

		await upsertProvider({
			id: providerId,
			legalName: "Policy Read Provider",
			ownerEmail: email,
		})
		await upsertDestination({
			id: destinationId,
			name: "Policy Read Destination",
			type: "city",
			country: "CL",
			slug: `policy-read-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Policy Read Product",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		const created = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Cancellation",
			description: "Flexible read contract",
			policyPresetKey: "flex_24h",
			stayLengthType: "short_stay",
			gracePeriod: 24,
			refundBasis: "total_booking",
			payoutBasis: "collected",
			localTimezone: "America/Santiago",
			legalOverrideFlags: { localLawOverridesPreset: true },
			cancellationTiers: [
				{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
				{ daysBeforeArrival: 0, penaltyType: "percentage", penaltyAmount: 100 },
			],
		})
		const assigned = await assignPolicyCapa6({
			policyId: created.policyId,
			scope: "product",
			scopeId: productId,
			channel: "web",
		})

		await withSupabaseAuthStub({ [token]: { id: `user_${email}`, email } }, async () => {
			const response = await getPolicyById({
				params: { id: created.policyId },
				request: authedGetRequest(`/api/policies/${created.policyId}`, token),
			} as any)

			expect(response.status).toBe(200)
			const body = await readJson<any>(response)
			expect(body.policy.id).toBe(created.policyId)
			expect(body.policy.policyPresetKey).toBe("flex_24h")
			expect(body.policy.stayLengthType).toBe("short_stay")
			expect(body.policy.gracePeriod).toBe(24)
			expect(body.policy.refundBasis).toBe("total_booking")
			expect(body.policy.payoutBasis).toBe("collected")
			expect(body.policy.localTimezone).toBe("America/Santiago")
			expect(body.policy.legalOverrideFlags).toEqual({ localLawOverridesPreset: true })
			expect(body.policyPresetKey).toBe("flex_24h")
			expect(body.group.id).toBe(created.groupId)
			expect(body.group.category).toBe("Cancellation")
			expect(body.category).toBe("Cancellation")
			expect(body.tiers).toHaveLength(2)
			expect(body.cancellationTiers).toHaveLength(2)
			expect(body.rules).toEqual([])
			expect(body.policyRules).toEqual([])
			expect(body.assignments).toEqual([
				expect.objectContaining({
					id: assigned.assignmentId,
					scope: "product",
					scopeId: productId,
					channel: "web",
					isActive: true,
				}),
			])
		})
	})
})
