import { PolicyCommandRepositoryCapa6 } from "@/modules/policies/infrastructure/repositories/PolicyCommandRepositoryCapa6"
import { PolicyExceptionRuleRepository } from "@/modules/policies/infrastructure/repositories/PolicyExceptionRuleRepository"
import type {
	PolicyExceptionRuleAction,
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
	const evidenceAttachments = input.action.evidenceAttachments?.length
		? input.action.evidenceAttachments
		: input.action.note
			? [
					{
						type: "ticket" as const,
						label: "Evidencia operativa",
						value: input.action.note,
					},
				]
			: []
	const approval = input.action.approval ?? {
		status: "approved" as const,
		approvedAt: new Date().toISOString(),
		approvedBy: actorUserId ?? null,
		reason: input.action.note ?? input.reason ?? null,
	}
	const created = await policyExceptionRuleRepository.create({
		...input,
		isActive: approval.status === "approved" ? input.isActive : false,
		action: {
			...input.action,
			evidenceAttachments,
			approval,
		},
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
	const before = await policyExceptionRuleRepository.findById(params.id)
	const updated = await policyExceptionRuleRepository.setActive(params)
	if (updated) {
		await policyCommandRepository.createAuditLog({
			eventType: "policy_exception_updated",
			actorUserId: params.actorUserId ?? null,
			scope: updated.scope ?? null,
			scopeId: updated.scopeId ?? null,
			before,
			after: updated,
		})
	}
	return updated
}

export async function approvePolicyExceptionRuleUseCase(params: {
	id: string
	actorUserId?: string | null
	reason?: string | null
}) {
	const before = await policyExceptionRuleRepository.findById(params.id)
	if (!before) return null
	const action: PolicyExceptionRuleAction = {
		...before.action,
		approval: {
			...(before.action.approval ?? {}),
			status: "approved",
			approvedAt: new Date().toISOString(),
			approvedBy: params.actorUserId ?? null,
			reason: params.reason ?? before.action.approval?.reason ?? null,
		},
	}
	const updated = await policyExceptionRuleRepository.updateAction({
		id: params.id,
		action,
		isActive: true,
	})
	if (updated) {
		await policyCommandRepository.createAuditLog({
			eventType: "policy_exception_approved",
			actorUserId: params.actorUserId ?? null,
			scope: updated.scope ?? null,
			scopeId: updated.scopeId ?? null,
			before,
			after: updated,
		})
	}
	return updated
}

export async function rejectPolicyExceptionRuleUseCase(params: {
	id: string
	actorUserId?: string | null
	reason?: string | null
}) {
	const before = await policyExceptionRuleRepository.findById(params.id)
	if (!before) return null
	const action: PolicyExceptionRuleAction = {
		...before.action,
		approval: {
			...(before.action.approval ?? {}),
			status: "rejected",
			rejectedAt: new Date().toISOString(),
			rejectedBy: params.actorUserId ?? null,
			reason: params.reason ?? before.action.approval?.reason ?? null,
		},
	}
	const updated = await policyExceptionRuleRepository.updateAction({
		id: params.id,
		action,
		isActive: false,
	})
	if (updated) {
		await policyCommandRepository.createAuditLog({
			eventType: "policy_exception_rejected",
			actorUserId: params.actorUserId ?? null,
			scope: updated.scope ?? null,
			scopeId: updated.scopeId ?? null,
			before,
			after: updated,
		})
	}
	return updated
}

export async function rollbackPolicyExceptionRuleUseCase(params: {
	id: string
	actorUserId?: string | null
	reason?: string | null
}) {
	const before = await policyExceptionRuleRepository.findById(params.id)
	if (!before) return null
	const action: PolicyExceptionRuleAction = {
		...before.action,
		approval: {
			...(before.action.approval ?? {}),
			status: "rolled_back",
			rolledBackAt: new Date().toISOString(),
			rolledBackBy: params.actorUserId ?? null,
			reason: params.reason ?? before.action.approval?.reason ?? null,
		},
		rollbackOf: before.id,
	}
	const updated = await policyExceptionRuleRepository.updateAction({
		id: params.id,
		action,
		isActive: false,
	})
	if (updated) {
		await policyCommandRepository.createAuditLog({
			eventType: "policy_exception_rolled_back",
			actorUserId: params.actorUserId ?? null,
			scope: updated.scope ?? null,
			scopeId: updated.scopeId ?? null,
			before,
			after: updated,
		})
	}
	return updated
}
