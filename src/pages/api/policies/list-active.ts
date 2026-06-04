import type { APIRoute } from "astro"
import { db, and, eq, inArray, Policy, PolicyGroup } from "astro:db"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOwnedPolicyGroupIds } from "@/lib/policies/policyOwnership"

// Minimal provider-only endpoint for CAPA 6 UX validation.
// Lists active policies with their categories for selection/assignment.
export const GET: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const ownedGroupIds = await getOwnedPolicyGroupIds(providerId)
	if (!ownedGroupIds.length) {
		return new Response(JSON.stringify([]), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}

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
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(and(eq(Policy.status, "active"), inArray(Policy.groupId, ownedGroupIds)))

	return new Response(JSON.stringify(rows), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
