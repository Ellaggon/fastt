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
	}): Promise<{
		id: string
		policyGroupId: string
		scope: PolicyScope
		scopeId: string
		channel: string | null
	} | null> {
		const channelCond =
			params.channel == null
				? isNull(PolicyAssignment.channel)
				: eq(PolicyAssignment.channel, params.channel)

		const row = await db
			.select({
				id: PolicyAssignment.id,
				policyGroupId: PolicyAssignment.policyGroupId,
				scope: PolicyAssignment.scope,
				scopeId: PolicyAssignment.scopeId,
				channel: PolicyAssignment.channel,
			})
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

		return row
			? {
					id: String(row.id),
					policyGroupId: String(row.policyGroupId),
					scope: String(row.scope) as PolicyScope,
					scopeId: String(row.scopeId),
					channel: row.channel == null ? null : String(row.channel),
				}
			: null
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

	async setAssignmentActiveById(assignmentId: string, isActive: boolean): Promise<void> {
		const id = String(assignmentId ?? "").trim()
		if (!id) return
		await db.update(PolicyAssignment).set({ isActive }).where(eq(PolicyAssignment.id, id))
	}

	async resolveScopeContext(params: {
		scope: PolicyScope
		scopeId: string
	}): Promise<{ productId: string; variantId?: string; ratePlanId?: string } | null> {
		const scopeId = String(params.scopeId ?? "").trim()
		if (!scopeId) return null

		if (params.scope === "product") {
			const product = await db
				.select({ id: Product.id })
				.from(Product)
				.where(eq(Product.id, scopeId))
				.get()
			return product ? { productId: String(product.id) } : null
		}

		if (params.scope === "variant") {
			const variant = await db
				.select({ id: Variant.id, productId: Variant.productId })
				.from(Variant)
				.where(eq(Variant.id, scopeId))
				.get()
			if (!variant) return null
			return { productId: String(variant.productId), variantId: String(variant.id) }
		}

		if (params.scope === "rate_plan") {
			const ratePlan = await db
				.select({ id: RatePlan.id, variantId: RatePlan.variantId })
				.from(RatePlan)
				.where(eq(RatePlan.id, scopeId))
				.get()
			if (!ratePlan) return null
			const variant = await db
				.select({ id: Variant.id, productId: Variant.productId })
				.from(Variant)
				.where(eq(Variant.id, String(ratePlan.variantId)))
				.get()
			if (!variant) return null
			return {
				productId: String(variant.productId),
				variantId: String(variant.id),
				ratePlanId: String(ratePlan.id),
			}
		}

		return null
	}
}
