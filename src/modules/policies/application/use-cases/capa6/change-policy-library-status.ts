import { PolicyValidationError } from "../../errors/policyValidationError"
import type {
	PolicyCommandRepositoryPortCapa6,
	PolicyLibraryStatus,
} from "../../ports/PolicyCommandRepositoryPortCapa6"

export type ChangePolicyLibraryStatusInput = {
	policyId: string
	status: Extract<PolicyLibraryStatus, "active" | "archived">
	actorUserId?: string
}

export async function changePolicyLibraryStatusCapa6(
	deps: { commandRepo: PolicyCommandRepositoryPortCapa6 },
	input: ChangePolicyLibraryStatusInput
): Promise<{ policyId: string; status: PolicyLibraryStatus }> {
	const policyId = String(input.policyId ?? "").trim()
	if (!policyId) throw new PolicyValidationError([{ path: ["policyId"], code: "required" }])

	const policy = await deps.commandRepo.getPolicyById(policyId)
	if (!policy) throw new PolicyValidationError([{ path: ["policyId"], code: "not_found" }])

	const currentStatus = String(policy.status)
	if (input.status === "active" && currentStatus === "archived") {
		throw new PolicyValidationError([{ path: ["status"], code: "archived_policy_cannot_publish" }])
	}
	if (input.status === "archived" && currentStatus === "archived") {
		return { policyId, status: "archived" }
	}
	if (input.status === "active" && currentStatus === "active") {
		return { policyId, status: "active" }
	}

	const updated = await deps.commandRepo.updatePolicyStatus({ policyId, status: input.status })
	await deps.commandRepo.createAuditLog({
		eventType: input.status === "active" ? "policy_published" : "policy_archived",
		actorUserId: input.actorUserId ?? null,
		policyId,
		policyGroupId: policy.groupId,
		before: { status: currentStatus },
		after: { status: input.status },
	})

	return updated
}
