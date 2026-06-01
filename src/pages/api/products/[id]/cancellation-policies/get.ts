import type { APIRoute } from "astro"
import { requireProvider } from "@/lib/auth/requireProvider"
import { productRepository } from "@/container"
import {
	legacyCancellationPolicyError,
	legacyCancellationPolicyJson,
} from "@/lib/policies/legacyCancellationPolicyApi"
import {
	CancellationTier,
	Policy,
	PolicyAssignment,
	PolicyGroup,
	and,
	db,
	desc,
	eq,
} from "astro:db"

const SUCCESSOR_API = "/api/policies/[id]"

export const GET: APIRoute = async ({ params, request }) => {
	const { providerId } = await requireProvider(request)
	const productId = params.id
	if (!productId) return legacyCancellationPolicyError("Missing id", 400, SUCCESSOR_API)
	const owned = await productRepository.ensureProductOwnedByProvider(productId, providerId)
	if (!owned) {
		return legacyCancellationPolicyError("Not found", 404, SUCCESSOR_API)
	}

	const assignments = await db
		.select()
		.from(PolicyAssignment)
		.where(and(eq(PolicyAssignment.scope, "product"), eq(PolicyAssignment.scopeId, productId)))
		.all()

	if (!assignments.length) {
		return legacyCancellationPolicyJson({ policies: [] }, SUCCESSOR_API, { status: 200 })
	}

	const policies: any[] = []
	for (const assignment of assignments) {
		const latest = await db
			.select({
				id: Policy.id,
				groupId: Policy.groupId,
				version: Policy.version,
				status: Policy.status,
				description: Policy.description,
			})
			.from(Policy)
			.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
			.where(
				and(
					eq(Policy.groupId, assignment.policyGroupId as any),
					eq(PolicyGroup.category, "Cancellation")
				)
			)
			.orderBy(desc(Policy.version))
			.get()

		if (!latest?.id) continue

		const tiers = await db
			.select()
			.from(CancellationTier)
			.where(eq(CancellationTier.policyId, latest.id))
			.all()

		policies.push({
			...latest,
			name: latest.description,
			tiers,
			assignmentId: assignment.id,
			isActive: assignment.isActive,
		})
	}

	return legacyCancellationPolicyJson({ policies }, SUCCESSOR_API, { status: 200 })
}
