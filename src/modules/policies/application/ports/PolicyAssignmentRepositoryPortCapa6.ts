import type { PolicyCategory } from "../../domain/policy.category"
import type { PolicyScope } from "../../domain/policy.scope"

export interface PolicyAssignmentRepositoryPortCapa6 {
	scopeExists(params: { scope: PolicyScope; scopeId: string }): Promise<boolean>

	findActiveAssignmentByScopeCategoryChannel(params: {
		scope: PolicyScope
		scopeId: string
		category: PolicyCategory
		channel: string | null
	}): Promise<{ id: string } | null>

	createAssignment(params: {
		policyGroupId: string
		scope: PolicyScope
		scopeId: string
		channel: string | null
	}): Promise<{ assignmentId: string }>

	deactivateAssignmentById(assignmentId: string): Promise<void>
}
