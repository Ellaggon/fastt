import type { APIRoute } from "astro"
import { applyPolicyPresetUseCase } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const { policyId, presetKey } = await request.json()
	console.log("presetKey", presetKey)

	if (!policyId || !presetKey) return new Response("Missing params", { status: 400 })
	const res = await applyPolicyPresetUseCase(policyId, presetKey)
	if (!res.ok) return new Response(res.message, { status: res.status })

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
