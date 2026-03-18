import type { APIRoute } from "astro"
import { toggleCancellationPolicyAssignment } from "@/modules/catalog/application/use-cases/toggle-cancellation-policy-assignment"

export const POST: APIRoute = async ({ request }) => {
	const { assignmentId, isActive } = await request.json()
	return toggleCancellationPolicyAssignment({ assignmentId, isActive })
}
