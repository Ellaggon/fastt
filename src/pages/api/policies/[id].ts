import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { ensurePolicyOwnedByProvider } from "@/lib/policies/policyOwnership"
import { getPolicyDetailCapa6UseCase } from "@/container/policies-read.container"

export const GET: APIRoute = async ({ params, request }) => {
	const { providerId } = await requireProvider(request)
	const { id } = params

	if (!id) {
		return new Response("Missing policy id", { status: 400 })
	}

	const policyOwned = await ensurePolicyOwnedByProvider({ providerId, policyId: id })
	if (!policyOwned) {
		return new Response("Policy not found", { status: 404 })
	}

	const detail = await getPolicyDetailCapa6UseCase(id)
	if (!detail) {
		return new Response("Policy not found", { status: 404 })
	}

	return new Response(
		JSON.stringify({
			policy: detail.policy,
			group: detail.group,
			rules: detail.rules,
			tiers: detail.tiers,
			assignments: detail.assignments,
			// Backward-compatible flat fields for older UI/tests.
			...detail.policy,
			category: detail.group.category,
			// Backward-compatible aliases for older UI/tests.
			policyRules: detail.rules,
			cancellationTiers: detail.tiers,
		}),
		{
			headers: { "Content-Type": "application/json" },
		}
	)
}
