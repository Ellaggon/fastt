import type { APIRoute } from "astro"
import { Policy, db, desc, eq } from "astro:db"
import { createPolicyVersionCapa6UseCase } from "@/container/policies-write.container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { ensurePolicyOwnedByProvider } from "@/lib/policies/policyOwnership"
import {
	legacyCancellationPolicyError,
	legacyCancellationPolicyJson,
} from "@/lib/policies/legacyCancellationPolicyApi"

const SUCCESSOR_API = "/api/policies/create-version"

export const POST: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const { groupId, name, tiers } = await request.json()
	const normalizedGroupId = String(groupId ?? "").trim()
	if (!normalizedGroupId)
		return legacyCancellationPolicyError("Missing groupId", 400, SUCCESSOR_API)

	const latest = await db
		.select({ id: Policy.id })
		.from(Policy)
		.where(eq(Policy.groupId, normalizedGroupId))
		.orderBy(desc(Policy.version))
		.get()
	if (!latest?.id) return legacyCancellationPolicyError("Policy not found", 404, SUCCESSOR_API)
	const policyOwned = await ensurePolicyOwnedByProvider({
		providerId,
		policyId: String(latest.id),
	})
	if (!policyOwned) {
		return legacyCancellationPolicyError("Not found", 404, SUCCESSOR_API)
	}

	const created = await createPolicyVersionCapa6UseCase({
		previousPolicyId: String(latest.id),
		description: String(name ?? ""),
		cancellationTiers: Array.isArray(tiers) ? tiers : [],
	})

	return legacyCancellationPolicyJson(
		{
			success: true,
			id: created.policyId,
			groupId: created.groupId,
			version: created.version,
		},
		SUCCESSOR_API,
		{ status: 200 }
	)
}
