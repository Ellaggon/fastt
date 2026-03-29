import { randomUUID } from "crypto"
import {
	db,
	and,
	eq,
	isNull,
	PolicyAssignment,
	PolicyGroup,
	Product,
	Variant,
	RatePlan,
} from "astro:db"
import type { PolicyCategory } from "../../domain/policy.category"
import type { PolicyScope } from "../../domain/policy.scope"
import type { PolicyAssignmentRepositoryPortCapa6 } from "../../application/ports/PolicyAssignmentRepositoryPortCapa6"

export class PolicyAssignmentRepositoryCapa6 implements PolicyAssignmentRepositoryPortCapa6 {
	async scopeExists(params: { scope: PolicyScope; scopeId: string }): Promise<boolean> {
		const id = String(params.scopeId ?? "").trim()
		if (!id) return false

		if (params.scope === "product") {
			const row = await db.select({ id: Product.id }).from(Product).where(eq(Product.id, id)).get()
			return !!row
		}
		if (params.scope === "variant") {
			const row = await db.select({ id: Variant.id }).from(Variant).where(eq(Variant.id, id)).get()
			return !!row
		}
		if (params.scope === "rate_plan") {
			const row = await db
				.select({ id: RatePlan.id })
				.from(RatePlan)
				.where(eq(RatePlan.id, id))
				.get()
			return !!row
		}
		if (params.scope === "global") return id === "global"

		return false
	}

	async findActiveAssignmentByScopeCategoryChannel(params: {
		scope: PolicyScope
		scopeId: string
		category: PolicyCategory
		channel: string | null
	}): Promise<{ id: string } | null> {
		const channelCond =
			params.channel == null
				? isNull(PolicyAssignment.channel)
				: eq(PolicyAssignment.channel, params.channel)

		const row = await db
			.select({ id: PolicyAssignment.id })
			.from(PolicyAssignment)
			.innerJoin(PolicyGroup, eq(PolicyAssignment.policyGroupId, PolicyGroup.id))
			.where(
				and(
					eq(PolicyAssignment.isActive, true),
					eq(PolicyAssignment.scope, params.scope),
					eq(PolicyAssignment.scopeId, params.scopeId),
					channelCond,
					eq(PolicyGroup.category, params.category)
				)
			)
			.get()

		return row ? { id: String(row.id) } : null
	}

	async createAssignment(params: {
		policyGroupId: string
		scope: PolicyScope
		scopeId: string
		channel: string | null
	}): Promise<{ assignmentId: string }> {
		const assignmentId = randomUUID()
		await db.insert(PolicyAssignment).values({
			id: assignmentId,
			policyGroupId: params.policyGroupId,
			scope: params.scope,
			scopeId: params.scopeId,
			channel: params.channel ?? null,
			isActive: true,
		} as any)
		return { assignmentId }
	}

	async deactivateAssignmentById(assignmentId: string): Promise<void> {
		const id = String(assignmentId ?? "").trim()
		if (!id) return
		await db.update(PolicyAssignment).set({ isActive: false }).where(eq(PolicyAssignment.id, id))
	}
}
