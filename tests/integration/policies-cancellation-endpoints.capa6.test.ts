import { describe, expect, it } from "vitest"

import { POST as createCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/create"
import { GET as getCancellationPoliciesGet } from "@/pages/api/products/[id]/cancellation-policies/get"
import { POST as updateCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/update"
import { POST as toggleCancellationPolicyPost } from "@/pages/api/products/[id]/cancellation-policies/toggle"

function request(path: string, method: "GET" | "POST" = "POST") {
	return new Request(`http://localhost:4321${path}`, {
		method,
		headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
		body: method === "POST" ? JSON.stringify({}) : undefined,
	})
}

async function expectGone(res: Response, successor: string) {
	expect(res.status).toBe(410)
	expect(res.headers.get("Deprecation")).toBe("true")
	expect(res.headers.get("Warning")).toContain("Retired endpoint")
	expect(res.headers.get("Link")).toBe(`<${successor}>; rel="successor-version"`)
	expect(res.headers.get("X-Fastt-Compatibility")).toBe("cancellation-policies-capa6-bridge")

	const body = await res.json()
	expect(body.error).toBe("Gone")
	expect(body.deprecated).toBe(true)
	expect(body.compatibilityMode).toBe("capa6_bridge")
	expect(body.migration?.successor).toBe(successor)
}

describe("integration/policies cancellation endpoints legacy retirement", () => {
	it("returns 410 with CAPA 6 alternatives for all products cancellation-policies routes", async () => {
		const productId = `prod_legacy_retired_${crypto.randomUUID()}`

		await expectGone(
			await createCancellationPolicyPost({
				params: { id: productId },
				request: request(`/api/products/${productId}/cancellation-policies/create`),
			} as any),
			"/api/policies/create"
		)

		await expectGone(
			await getCancellationPoliciesGet({
				params: { id: productId },
				request: request(`/api/products/${productId}/cancellation-policies/get`, "GET"),
			} as any),
			"/provider/policies"
		)

		await expectGone(
			await updateCancellationPolicyPost({
				params: { id: productId },
				request: request(`/api/products/${productId}/cancellation-policies/update`),
			} as any),
			"/api/policies/create-version"
		)

		await expectGone(
			await toggleCancellationPolicyPost({
				params: { id: productId },
				request: request(`/api/products/${productId}/cancellation-policies/toggle`),
			} as any),
			"/api/policies/assign"
		)
	})
})
