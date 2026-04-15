import {
	sql,
	db,
	and,
	or,
	isNull,
	eq,
	inArray,
	ne,
	desc,
	Policy,
	PolicyAssignment,
	PolicyGroup,
	PolicyRule,
	CancellationTier,
	Variant,
} from "astro:db"

import type {
	PolicyQueryRepositoryPort,
	ResolvePoliciesParams,
} from "../../application/ports/PolicyQueryRepositoryPort"
import type { PolicyScope } from "../../domain/policy.scope"

export class PolicyReadRepository implements PolicyQueryRepositoryPort {
	async resolvePolicyRows(params: ResolvePoliciesParams) {
		const {
			productId,
			variantId,
			channel,
			category,
			arrivalDate,
			includeCancellation = false,
		} = params

		const scopeOrder = [
			{ scope: "variant", id: variantId },
			{ scope: "product", id: productId },
		].filter((s) => s.id)

		const scopeIds = scopeOrder.map((s) => s.id!)
		if (!scopeIds.length) return []

		const channelFilter =
			channel != null
				? or(eq(PolicyAssignment.channel, channel), isNull(PolicyAssignment.channel))
				: isNull(PolicyAssignment.channel)

		const whereConditions = [
			inArray(PolicyAssignment.scopeId, scopeIds),
			eq(Policy.status, "active"),
			channelFilter,
			eq(PolicyAssignment.isActive, true),
		]

		if (category) {
			whereConditions.push(eq(PolicyGroup.category, category))
		} else if (!includeCancellation) {
			whereConditions.push(ne(PolicyGroup.category, "Cancellation"))
		}

		if (arrivalDate) {
			whereConditions.push(
				or(isNull(Policy.effectiveFrom), sql`${Policy.effectiveFrom} <= ${arrivalDate}`)
			)

			whereConditions.push(
				or(isNull(Policy.effectiveTo), sql`${Policy.effectiveTo} >= ${arrivalDate}`)
			)
		}

		return db
			.select({
				id: Policy.id,
				groupId: Policy.groupId,
				category: PolicyGroup.category,
				description: Policy.description,
				version: Policy.version,
				scope: PolicyAssignment.scope as any,
				scopeId: PolicyAssignment.scopeId,
			})
			.from(PolicyAssignment)
			.innerJoin(Policy, eq(Policy.groupId, PolicyAssignment.policyGroupId))
			.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
			.where(and(...whereConditions))
	}

	async listPolicyRulesByPolicyIds(policyIds: string[]) {
		if (!policyIds.length) return []
		return db.select().from(PolicyRule).where(inArray(PolicyRule.policyId, policyIds))
	}

	async listCancellationTiersByPolicyIds(policyIds: string[]) {
		if (!policyIds.length) return []
		return db.select().from(CancellationTier).where(inArray(CancellationTier.policyId, policyIds))
	}

	async findAssignment(scope: PolicyScope, scopeId: string, category: string) {
		const rows = await db
			.select()
			.from(PolicyAssignment)
			.innerJoin(PolicyGroup, eq(PolicyAssignment.policyGroupId, PolicyGroup.id))
			.where(
				and(
					eq(PolicyAssignment.scope, scope),
					eq(PolicyAssignment.scopeId, scopeId),
					eq(PolicyGroup.category, category)
				)
			)

		return rows[0] ?? null
	}

	async findActivePolicy(groupId: string) {
		return db
			.select()
			.from(Policy)
			.where(and(eq(Policy.groupId, groupId), eq(Policy.status, "active")))
			.orderBy(desc(Policy.version))
			.limit(1)
			.get()
	}

	async findParent(type: string, id: string) {
		if (type === "variant") {
			const row = await db
				.select({ id: Variant.id, productId: Variant.productId })
				.from(Variant)
				.where(eq(Variant.id, id))
				.get()
			if (!row) return null
			return { type: "product", id: row.productId }
		}

		if (type === "product") return null

		return null
	}

	async listPolicyRulesByPolicyId(policyId: string) {
		return db.select().from(PolicyRule).where(eq(PolicyRule.policyId, policyId))
	}

	async listCancellationTiersByPolicyId(policyId: string) {
		return db.select().from(CancellationTier).where(eq(CancellationTier.policyId, policyId))
	}

	async getPolicyById(policyId: string) {
		return db.select().from(Policy).where(eq(Policy.id, policyId)).get()
	}

	async listAssignedPoliciesByScope(scopeId: string, category?: string | null) {
		const assignments = await db
			.select({
				groupId: PolicyAssignment.policyGroupId,
			})
			.from(PolicyAssignment)
			.where(eq(PolicyAssignment.scopeId, scopeId))

		if (!assignments.length) return []

		const groupIds = assignments.map((a) => a.groupId)

		const baseCondition = inArray(Policy.groupId, groupIds)

		const finalCondition = category
			? and(baseCondition, eq(PolicyGroup.category, category))
			: baseCondition

		return db
			.select({
				id: Policy.id,
				groupId: Policy.groupId,
				version: Policy.version,
				status: Policy.status,
				description: Policy.description,
				category: PolicyGroup.category,
			})
			.from(Policy)
			.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
			.where(finalCondition)
	}

	async listAssignmentsByGroupId(groupId: string) {
		return db.select().from(PolicyAssignment).where(eq(PolicyAssignment.policyGroupId, groupId))
	}

	async listPolicyHistoryByGroupId(groupId: string) {
		return db.select().from(Policy).where(eq(Policy.groupId, groupId))
	}
}
