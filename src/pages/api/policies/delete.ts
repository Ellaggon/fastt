import type { APIRoute } from "astro"
import { deleteDraftPolicyUseCase } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const { policyId } = await request.json()

	if (!policyId) {
		return new Response("Missing policyId", { status: 400 })
	}
	try {
		await deleteDraftPolicyUseCase(policyId)
	} catch (err: any) {
		if (String(err?.message || err) === "Policy not found")
			return new Response("Policy not found", { status: 404 })
		if (String(err?.message || err) === "Only draft policies can be deleted")
			return new Response("Only draft policies can be deleted", { status: 400 })
		throw err
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { "Content-Type": "application/json" },
	})
}
