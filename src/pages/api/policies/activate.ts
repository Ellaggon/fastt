import type { APIRoute } from "astro"
import { activatePolicyUseCase } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()
	const { policyId, effectiveFrom } = body

	if (!policyId) return new Response("Missing policyId", { status: 400 })

	try {
		await activatePolicyUseCase(policyId, effectiveFrom)
	} catch (err: any) {
		if (String(err?.message || err) === "Policy not found") {
			return new Response("Policy not found", { status: 404 })
		}
		throw err
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
