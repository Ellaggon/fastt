import type { APIRoute } from "astro"
import {
	assignPolicyCapa6UseCase,
	createPolicyCapa6UseCase,
} from "@/container/policies-write.container"

export const POST: APIRoute = async ({ params, request }) => {
	const productId = params.id
	if (!productId) return new Response("Missing productId", { status: 400 })

	const { name, tiers } = await request.json()
	const created = await createPolicyCapa6UseCase({
		category: "Cancellation",
		description: String(name ?? ""),
		cancellationTiers: Array.isArray(tiers) ? tiers : [],
	})
	await assignPolicyCapa6UseCase({
		policyId: created.policyId,
		scope: "product",
		scopeId: productId,
		channel: null,
	})
	return new Response(
		JSON.stringify({ success: true, groupId: created.groupId, id: created.policyId }),
		{
			status: 200,
			headers: { "Content-Type": "application/json", "Deprecation": "true" },
		}
	)
}
