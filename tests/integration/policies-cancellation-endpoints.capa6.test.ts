import { describe, expect, it } from "vitest"

import { POST as createCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/create"
import { GET as getCancellationPoliciesGet } from "@/pages/api/products/[id]/cancellation-policies/get"
import { POST as updateCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/update"
import { POST as toggleCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/toggle"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

function readJson<T = any>(res: Response): Promise<T> {
	return res.text().then((txt) => (txt ? JSON.parse(txt) : ({} as T)))
}

describe("integration/policies cancellation endpoints (CAPA6 wiring)", () => {
	it("supports create -> get -> update -> toggle flow with consistent reads", async () => {
		const suffix = crypto.randomUUID()
		const destinationId = `dest_pol_ep_${suffix}`
		const productId = `prod_pol_ep_${suffix}`

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
		})

		const createRes = await createCancellationPolicyPost({
			params: { id: productId },
			request: new Request(
				`http://localhost:4321/api/products/${productId}/cancellation-policies/create`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: "Flexible",
						tiers: [{ daysBeforeArrival: 3, penaltyType: "percentage", penaltyAmount: 100 }],
					}),
				}
			),
		} as any)
		expect(createRes.status).toBe(200)
		const createBody = await readJson<{ success: boolean; id: string; groupId: string }>(createRes)
		expect(createBody.success).toBe(true)
		expect(typeof createBody.id).toBe("string")
		expect(typeof createBody.groupId).toBe("string")

		const getRes1 = await getCancellationPoliciesGet({
			params: { id: productId },
		} as any)
		expect(getRes1.status).toBe(200)
		const getBody1 = await readJson<{ policies: Array<any> }>(getRes1)
		expect(Array.isArray(getBody1.policies)).toBe(true)
		expect(getBody1.policies.length).toBeGreaterThan(0)
		const latest1 = getBody1.policies[0]
		expect(latest1.groupId).toBe(createBody.groupId)
		expect(latest1.version).toBe(1)
		expect(latest1.isActive).toBe(true)
		expect(typeof latest1.assignmentId).toBe("string")

		const updateRes = await updateCancellationPolicyPost({
			request: new Request(
				`http://localhost:4321/api/products/${productId}/cancellation-policies/update`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						groupId: createBody.groupId,
						name: "Flexible v2",
						tiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
					}),
				}
			),
		} as any)
		expect(updateRes.status).toBe(200)
		const updateBody = await readJson<{ success: boolean; groupId: string; version: number }>(
			updateRes
		)
		expect(updateBody.success).toBe(true)
		expect(updateBody.groupId).toBe(createBody.groupId)
		expect(updateBody.version).toBe(2)

		const getRes2 = await getCancellationPoliciesGet({
			params: { id: productId },
		} as any)
		const getBody2 = await readJson<{ policies: Array<any> }>(getRes2)
		expect(getBody2.policies.length).toBeGreaterThan(0)
		const latest2 = getBody2.policies[0]
		expect(latest2.groupId).toBe(createBody.groupId)
		expect(latest2.version).toBe(2)

		const toggleRes = await toggleCancellationPolicyPost({
			request: new Request(
				`http://localhost:4321/api/products/${productId}/cancellation-policies/toggle`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ assignmentId: latest2.assignmentId, isActive: false }),
				}
			),
		} as any)
		expect(toggleRes.status).toBe(200)
		const toggleBody = await readJson<{ success: boolean }>(toggleRes)
		expect(toggleBody.success).toBe(true)

		const getRes3 = await getCancellationPoliciesGet({
			params: { id: productId },
		} as any)
		const getBody3 = await readJson<{ policies: Array<any> }>(getRes3)
		expect(getBody3.policies.length).toBeGreaterThan(0)
		expect(getBody3.policies[0].isActive).toBe(false)
	})
})
