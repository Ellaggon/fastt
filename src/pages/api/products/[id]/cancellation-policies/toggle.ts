import type { APIRoute } from "astro"
import { cancellationPolicyRepository } from "@/container"
import { toggleCancellationPolicyAssignment } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request }) => {
	const { assignmentId, isActive } = await request.json()
	return toggleCancellationPolicyAssignment({
		repo: cancellationPolicyRepository,
		assignmentId,
		isActive,
	})
}
