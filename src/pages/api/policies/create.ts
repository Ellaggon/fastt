import type { APIRoute } from "astro"
import { createPolicyUseCase } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const { previousPolicyId, description, scope, scopeId, category, cancellationTiers } = body

	if (!scope || !scopeId || !category) {
		return new Response("Missing fields", { status: 400 })
	}

	try {
		const res = await createPolicyUseCase({
			previousPolicyId,
			description,
			scope,
			scopeId,
			category,
			cancellationTiers,
		})
		return Response.json(res)
	} catch (err: any) {
		if (String(err?.message || err) === "Policy not found")
			return new Response("Policy not found", { status: 404 })
		if (String(err?.message || err) === "Cancellation tiers required")
			return new Response("Cancellation tiers required", { status: 400 })
		if (String(err?.message || err) === "Missing fields")
			return new Response("Missing fields", { status: 400 })
		throw err
	}
}
