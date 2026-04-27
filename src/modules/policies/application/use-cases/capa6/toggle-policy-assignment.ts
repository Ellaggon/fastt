import { z } from "zod"
import type { PolicyAssignmentRepositoryPortCapa6 } from "../../ports/PolicyAssignmentRepositoryPortCapa6"

const togglePolicyAssignmentSchema = z.object({
	assignmentId: z.string().min(1),
	isActive: z.boolean(),
})

export type TogglePolicyAssignmentInput = z.infer<typeof togglePolicyAssignmentSchema>

export async function togglePolicyAssignmentCapa6(
	deps: {
		assignmentRepo: PolicyAssignmentRepositoryPortCapa6
	},
	input: TogglePolicyAssignmentInput
): Promise<{ assignmentId: string; isActive: boolean }> {
	const parsed = togglePolicyAssignmentSchema.parse(input)
	await deps.assignmentRepo.setAssignmentActiveById(parsed.assignmentId, parsed.isActive)
	return { assignmentId: parsed.assignmentId, isActive: parsed.isActive }
}
