import type { InternalPermission } from "./internal-authorization"

export type PolicyExceptionApprovalStatus = "pending" | "approved"
export type PolicyExceptionMutationOperation = "set_active" | "approve" | "reject" | "rollback"

/**
 * Draft work remains editable by policy editors. Any operation that can make
 * an exception effective (or roll back an effective exception) is a publish
 * operation and therefore needs the stricter permission.
 */
export function permissionForPolicyExceptionCreate(params: {
	approvalStatus?: PolicyExceptionApprovalStatus | null
}): InternalPermission {
	return params.approvalStatus === "approved" ? "policy.publish" : "policy.edit"
}

export function permissionForPolicyExceptionMutation(
	operation: PolicyExceptionMutationOperation
): InternalPermission {
	return operation === "approve" || operation === "rollback" || operation === "set_active"
		? "policy.publish"
		: "policy.edit"
}
