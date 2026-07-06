import type { PolicyCategory } from "../../domain/policy.category"
import type { PolicyScope } from "../../domain/policy.scope"

export interface PolicyAssignmentRepositoryPortCapa6 {
	replaceActiveAssignment(params: {
		policyId: string
		policyGroupId: string
		ownerProviderId: string
		category: PolicyCategory
		scope: PolicyScope
		scopeId: string
		channel: string | null
		actorUserId?: string | null
	}): Promise<{ assignmentId: string; replaced: boolean }>

	deactivateAssignment(params: {
		assignmentId: string
		ownerProviderId: string
		actorUserId?: string | null
	}): Promise<{ assignmentId: string; deactivated: boolean }>

	resolveScopeContext(params: { scope: PolicyScope; scopeId: string }): Promise<{
		providerId: string
		productId: string
		variantId?: string
		ratePlanId?: string
	} | null>
}
