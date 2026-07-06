import { z } from "zod"

import type { PolicyAssignmentRepositoryPortCapa6 } from "../../ports/PolicyAssignmentRepositoryPortCapa6"

const deactivatePolicyAssignmentSchema = z.object({
	assignmentId: z.string().min(1),
	ownerProviderId: z.string().min(1),
	actorUserId: z.string().min(1).optional(),
})

export type DeactivatePolicyAssignmentInput = z.input<typeof deactivatePolicyAssignmentSchema>

export async function deactivatePolicyAssignmentCapa6(
	deps: { assignmentRepo: PolicyAssignmentRepositoryPortCapa6 },
	input: DeactivatePolicyAssignmentInput
): Promise<{ assignmentId: string; deactivated: boolean }> {
	const parsed = deactivatePolicyAssignmentSchema.parse(input)
	return deps.assignmentRepo.deactivateAssignment({
		assignmentId: parsed.assignmentId,
		ownerProviderId: parsed.ownerProviderId,
		actorUserId: parsed.actorUserId ?? null,
	})
}
