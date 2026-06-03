import type { APIRoute } from "astro"
import { db, eq, inArray, Policy, PolicyGroup } from "astro:db"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOwnedPolicyGroupIds } from "@/lib/policies/policyOwnership"
import { ensurePolicySchemaCompatibility } from "@/lib/policies/policySchemaCompat"

export const GET: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	await ensurePolicySchemaCompatibility()
	const ownedGroupIds = await getOwnedPolicyGroupIds(providerId, { activeOnly: false })
	if (!ownedGroupIds.length) return Response.json([])

	const rows = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			category: PolicyGroup.category,
			description: Policy.description,
			version: Policy.version,
			status: Policy.status,
			policyPresetKey: (Policy as any).policyPresetKey,
			stayLengthType: (Policy as any).stayLengthType,
			gracePeriod: (Policy as any).gracePeriod,
			refundBasis: (Policy as any).refundBasis,
			payoutBasis: (Policy as any).payoutBasis,
			localTimezone: (Policy as any).localTimezone,
			legalOverrideFlags: (Policy as any).legalOverrideFlags,
			effectiveFrom: Policy.effectiveFrom,
			effectiveTo: Policy.effectiveTo,
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(inArray(Policy.groupId, ownedGroupIds))

	return Response.json(rows)
}
