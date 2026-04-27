import {
	assignPolicySchema,
	type AssignPolicyInput,
} from "../../schemas/policy-write/assignPolicySchema"
import { PolicyValidationError } from "../../errors/policyValidationError"
import type { PolicyCommandRepositoryPortCapa6 } from "../../ports/PolicyCommandRepositoryPortCapa6"
import type { PolicyAssignmentRepositoryPortCapa6 } from "../../ports/PolicyAssignmentRepositoryPortCapa6"

export type ReplacePolicyAssignmentInput = AssignPolicyInput & {
	actorUserId?: string
	checkIn?: string
	checkOut?: string
	requiredCategories?: string[]
}

function toISODateOnly(input?: string): string {
	if (input) {
		const parsed = new Date(`${input}T00:00:00.000Z`)
		if (Number.isNaN(parsed.getTime())) {
			throw new PolicyValidationError([{ path: ["checkIn"], code: "invalid_date" }])
		}
		return parsed.toISOString().slice(0, 10)
	}
	return new Date().toISOString().slice(0, 10)
}

// Replace semantics for overrides:
// - deactivate current active assignment for (scope, scopeId, category, channel)
// - create a new assignment for the selected policy's group
// This keeps history and avoids destructive deletes.
export async function replacePolicyAssignmentCapa6(
	deps: {
		commandRepo: PolicyCommandRepositoryPortCapa6
		assignmentRepo: PolicyAssignmentRepositoryPortCapa6
		resolveEffectivePolicies?: (ctx: {
			productId: string
			variantId?: string
			ratePlanId?: string
			checkIn?: string
			checkOut?: string
			channel?: string
			requiredCategories?: string[]
			onMissingCategory?: "return_null" | "throw_error"
		}) => Promise<{ missingCategories: string[] }>
	},
	input: ReplacePolicyAssignmentInput
): Promise<{ assignmentId: string; replaced: boolean }> {
	const parsed = assignPolicySchema.parse(input)
	const channel = parsed.channel ?? null

	const policy = await deps.commandRepo.getPolicyById(parsed.policyId)
	if (!policy) throw new PolicyValidationError([{ path: ["policyId"], code: "not_found" }])
	if (String(policy.status) !== "active") {
		throw new PolicyValidationError([{ path: ["policyId"], code: "policy_not_active" }])
	}
	if (
		policy.effectiveFrom &&
		policy.effectiveTo &&
		new Date(policy.effectiveFrom) > new Date(policy.effectiveTo)
	) {
		throw new PolicyValidationError([{ path: ["policyId"], code: "invalid_effective_window" }])
	}

	const exists = await deps.assignmentRepo.scopeExists({
		scope: parsed.scope,
		scopeId: parsed.scopeId,
	})
	if (!exists) throw new PolicyValidationError([{ path: ["scopeId"], code: "not_found" }])

	const current = await deps.assignmentRepo.findActiveAssignmentByScopeCategoryChannel({
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		category: policy.category,
		channel,
	})

	if (
		deps.resolveEffectivePolicies &&
		Array.isArray(input.requiredCategories) &&
		input.requiredCategories.length > 0
	) {
		const context = await deps.assignmentRepo.resolveScopeContext({
			scope: parsed.scope,
			scopeId: parsed.scopeId,
		})
		if (!context) {
			throw new PolicyValidationError([{ path: ["scopeId"], code: "scope_context_not_found" }])
		}
		const checkIn = toISODateOnly(input.checkIn)
		const checkOut = input.checkOut ? toISODateOnly(input.checkOut) : undefined
		try {
			await deps.resolveEffectivePolicies({
				productId: context.productId,
				variantId: context.variantId,
				ratePlanId: context.ratePlanId,
				checkIn,
				checkOut,
				channel: parsed.channel ?? undefined,
				requiredCategories: input.requiredCategories,
				onMissingCategory: "throw_error",
			})
		} catch (error: any) {
			const message = String(error?.message ?? error)
			if (message.startsWith("MISSING_POLICY_CATEGORY:")) {
				throw new PolicyValidationError([
					{ path: ["requiredCategories"], code: "missing_required_categories", message },
				])
			}
			throw error
		}
	}

	if (current) {
		await deps.assignmentRepo.deactivateAssignmentById(current.id)
	}

	const { assignmentId } = await deps.assignmentRepo.createAssignment({
		policyGroupId: policy.groupId,
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		channel,
	})

	await deps.commandRepo.createAuditLog({
		eventType: "assignment_replaced",
		actorUserId: input.actorUserId ?? null,
		policyId: policy.id,
		policyGroupId: policy.groupId,
		assignmentId,
		scope: parsed.scope,
		scopeId: parsed.scopeId,
		channel,
		before: current
			? {
					assignmentId: current.id,
					policyGroupId: current.policyGroupId,
					scope: current.scope,
					scopeId: current.scopeId,
					channel: current.channel,
				}
			: null,
		after: {
			assignmentId,
			policyGroupId: policy.groupId,
			scope: parsed.scope,
			scopeId: parsed.scopeId,
			channel,
		},
	})

	return { assignmentId, replaced: Boolean(current) }
}
