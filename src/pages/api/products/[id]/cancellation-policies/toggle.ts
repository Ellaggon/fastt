import type { APIRoute } from "astro"
import { togglePolicyAssignmentCapa6UseCase } from "@/container/policies-write.container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { ensurePolicyAssignmentOwnedByProvider } from "@/lib/policies/policyOwnership"
import {
	legacyCancellationPolicyError,
	legacyCancellationPolicyJson,
} from "@/lib/policies/legacyCancellationPolicyApi"

const SUCCESSOR_API = "/provider/policies"

export const POST: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const { assignmentId, isActive } = await request.json()
	const assignmentOwned = await ensurePolicyAssignmentOwnedByProvider({
		providerId,
		assignmentId: String(assignmentId ?? ""),
	})
	if (!assignmentOwned) {
		return legacyCancellationPolicyError("Not found", 404, SUCCESSOR_API)
	}
	await togglePolicyAssignmentCapa6UseCase({
		assignmentId: String(assignmentId ?? ""),
		isActive: Boolean(isActive),
	})
	return legacyCancellationPolicyJson({ success: true }, SUCCESSOR_API, { status: 200 })
}
