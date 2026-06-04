import { PolicyCommandRepositoryCapa6 } from "@/modules/policies/infrastructure/repositories/PolicyCommandRepositoryCapa6"
import { PolicyExceptionRuleRepository } from "@/modules/policies/infrastructure/repositories/PolicyExceptionRuleRepository"
import type {
	PolicyExceptionRuleContextFilter,
	PolicyExceptionRuleCreateInput,
	PolicyExceptionRuleListFilter,
} from "@/modules/policies/public"

const policyExceptionRuleRepository = new PolicyExceptionRuleRepository()
const policyCommandRepository = new PolicyCommandRepositoryCapa6()

export async function listPolicyExceptionRulesUseCase(filter?: PolicyExceptionRuleListFilter) {
	return policyExceptionRuleRepository.list(filter)
}

export async function resolvePolicyExceptionRulesUseCase(ctx: PolicyExceptionRuleContextFilter) {
	return policyExceptionRuleRepository.listApplicable(ctx)
}

export async function createPolicyExceptionRuleUseCase(
	input: PolicyExceptionRuleCreateInput,
	actorUserId?: string | null
) {
	const created = await policyExceptionRuleRepository.create({
		...input,
		createdBy: input.createdBy ?? actorUserId ?? null,
	})
	await policyCommandRepository.createAuditLog({
		eventType: "policy_exception_created",
		actorUserId: actorUserId ?? null,
		scope: created.scope ?? null,
		scopeId: created.scopeId ?? null,
		after: created,
	})
	return created
}

export async function setPolicyExceptionRuleActiveUseCase(params: {
	id: string
	isActive: boolean
	actorUserId?: string | null
}) {
	const updated = await policyExceptionRuleRepository.setActive(params)
	if (updated) {
		await policyCommandRepository.createAuditLog({
			eventType: "policy_exception_updated",
			actorUserId: params.actorUserId ?? null,
			scope: updated.scope ?? null,
			scopeId: updated.scopeId ?? null,
			after: updated,
		})
	}
	return updated
}
