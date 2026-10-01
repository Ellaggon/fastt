import { z } from "zod"

import type { PolicyAssignmentRepositoryPortCapa6 } from "../../ports/PolicyAssignmentRepositoryPortCapa6"

const deactivatePolicyAssignmentSchema = z.object({
	assignmentId: z.string().min(1),
	ownerProviderId: z.string().min(1),
	actorUserId: z.string().min(1).optional(),
	repairContext: z
		.object({
			productId: z.string().min(1),
			variantId: z.string().min(1),
			ratePlanId: z.string().min(1),
		})
		.strict()
		.optional(),
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
		repairContext: parsed.repairContext,
	})
}
