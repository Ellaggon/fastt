import { randomUUID } from "crypto"
import {
	db,
	and,
	eq,
	isNull,
	PolicyAssignment,
	PolicyAuditLog,
	Product,
	Variant,
	RatePlan,
} from "astro:db"
import type { PolicyCategory } from "../../domain/policy.category"
import type { PolicyScope } from "../../domain/policy.scope"
import type { PolicyAssignmentRepositoryPortCapa6 } from "../../application/ports/PolicyAssignmentRepositoryPortCapa6"

export class PolicyAssignmentRepositoryCapa6 implements PolicyAssignmentRepositoryPortCapa6 {
	async replaceActiveAssignment(params: {
		policyId: string
		policyGroupId: string
		ownerProviderId: string
		category: PolicyCategory
		scope: PolicyScope
		scopeId: string
		channel: string | null
		actorUserId?: string | null
	}): Promise<{ assignmentId: string; replaced: boolean }> {
		return db.transaction(async (tx) => {
			const context = await this.resolveScopeContextWith(tx, {
				scope: params.scope,
				scopeId: params.scopeId,
			})
			if (!context) throw new Error("POLICY_ASSIGNMENT_SCOPE_NOT_FOUND")
			if (context.providerId !== params.ownerProviderId) {
				throw new Error("POLICY_ASSIGNMENT_OWNER_MISMATCH")
			}

			const channelCondition =
				params.channel == null
					? isNull(PolicyAssignment.channel)
					: eq(PolicyAssignment.channel, params.channel)
			const current = await tx
				.select({
					id: PolicyAssignment.id,
					policyGroupId: PolicyAssignment.policyGroupId,
					scope: PolicyAssignment.scope,
					scopeId: PolicyAssignment.scopeId,
					channel: PolicyAssignment.channel,
				})
				.from(PolicyAssignment)
				.where(
					and(
						eq(PolicyAssignment.isActive, true),
						eq(PolicyAssignment.scope, params.scope),
						eq(PolicyAssignment.scopeId, params.scopeId),
						eq(PolicyAssignment.category, params.category),
						channelCondition,
						isNull(PolicyAssignment.effectiveFrom),
						isNull(PolicyAssignment.effectiveTo)
					)
				)
				.get()

			if (current && String(current.policyGroupId) === params.policyGroupId) {
				return { assignmentId: String(current.id), replaced: false }
			}

			if (current) {
				await tx
					.update(PolicyAssignment)
					.set({ isActive: false })
					.where(eq(PolicyAssignment.id, String(current.id)))
			}

			const assignmentId = randomUUID()
			await tx.insert(PolicyAssignment).values({
				id: assignmentId,
				policyGroupId: params.policyGroupId,
				category: params.category,
				scope: params.scope,
				scopeId: params.scopeId,
				channel: params.channel,
				effectiveFrom: null,
				effectiveTo: null,
				isActive: true,
				createdAt: new Date(),
			})
			await tx.insert(PolicyAuditLog).values({
				id: randomUUID(),
				eventType: current ? "assignment_replaced" : "assignment_created",
				actorUserId: params.actorUserId ?? null,
				policyId: params.policyId,
				policyGroupId: params.policyGroupId,
				assignmentId,
				scope: params.scope,
				scopeId: params.scopeId,
				channel: params.channel,
				beforeJson: current
					? {
							assignmentId: String(current.id),
							policyGroupId: String(current.policyGroupId),
							scope: String(current.scope),
							scopeId: String(current.scopeId),
							channel: current.channel == null ? null : String(current.channel),
						}
					: null,
				afterJson: {
					assignmentId,
					policyGroupId: params.policyGroupId,
					scope: params.scope,
					scopeId: params.scopeId,
					channel: params.channel,
				},
			})
			return { assignmentId, replaced: Boolean(current) }
		})
	}

	async deactivateAssignment(params: {
		assignmentId: string
		ownerProviderId: string
		actorUserId?: string | null
	}): Promise<{ assignmentId: string; deactivated: boolean }> {
		return db.transaction(async (tx) => {
			const assignment = await tx
				.select({
					id: PolicyAssignment.id,
					policyGroupId: PolicyAssignment.policyGroupId,
					scope: PolicyAssignment.scope,
					scopeId: PolicyAssignment.scopeId,
					channel: PolicyAssignment.channel,
					isActive: PolicyAssignment.isActive,
				})
				.from(PolicyAssignment)
				.where(eq(PolicyAssignment.id, params.assignmentId))
				.get()
			if (!assignment) throw new Error("POLICY_ASSIGNMENT_NOT_FOUND")

			const context = await this.resolveScopeContextWith(tx, {
				scope: assignment.scope as PolicyScope,
				scopeId: String(assignment.scopeId),
			})
			if (!context) throw new Error("POLICY_ASSIGNMENT_SCOPE_NOT_FOUND")
			if (context.providerId !== params.ownerProviderId) {
				throw new Error("POLICY_ASSIGNMENT_OWNER_MISMATCH")
			}
			if (!assignment.isActive) {
				return { assignmentId: String(assignment.id), deactivated: false }
			}

			await tx
				.update(PolicyAssignment)
				.set({ isActive: false })
				.where(eq(PolicyAssignment.id, String(assignment.id)))
			await tx.insert(PolicyAuditLog).values({
				id: randomUUID(),
				eventType: "assignment_deactivated",
				actorUserId: params.actorUserId ?? null,
				policyGroupId: String(assignment.policyGroupId),
				assignmentId: String(assignment.id),
				scope: String(assignment.scope),
				scopeId: String(assignment.scopeId),
				channel: assignment.channel == null ? null : String(assignment.channel),
				beforeJson: { isActive: true },
				afterJson: { isActive: false },
			})
			return { assignmentId: String(assignment.id), deactivated: true }
		})
	}

	async resolveScopeContext(params: { scope: PolicyScope; scopeId: string }): Promise<{
		providerId: string
		productId: string
		variantId?: string
		ratePlanId?: string
	} | null> {
		return this.resolveScopeContextWith(db, params)
	}

	private async resolveScopeContextWith(
		executor: any,
		params: { scope: PolicyScope; scopeId: string }
	): Promise<{
		providerId: string
		productId: string
		variantId?: string
		ratePlanId?: string
	} | null> {
		const scopeId = String(params.scopeId ?? "").trim()
		if (!scopeId) return null

		if (params.scope === "product") {
			const product = await executor
				.select({ id: Product.id, providerId: Product.providerId })
				.from(Product)
				.where(eq(Product.id, scopeId))
				.get()
			return product?.providerId
				? { providerId: String(product.providerId), productId: String(product.id) }
				: null
		}

		if (params.scope === "variant") {
			const variant = await executor
				.select({
					id: Variant.id,
					productId: Variant.productId,
					providerId: Product.providerId,
				})
				.from(Variant)
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.where(eq(Variant.id, scopeId))
				.get()
			if (!variant?.providerId) return null
			return {
				providerId: String(variant.providerId),
				productId: String(variant.productId),
				variantId: String(variant.id),
			}
		}

		if (params.scope === "rate_plan") {
			const ratePlan = await executor
				.select({
					id: RatePlan.id,
					variantId: RatePlan.variantId,
					productId: Variant.productId,
					providerId: Product.providerId,
				})
				.from(RatePlan)
				.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.where(eq(RatePlan.id, scopeId))
				.get()
			if (!ratePlan?.providerId) return null
			return {
				providerId: String(ratePlan.providerId),
				productId: String(ratePlan.productId),
				variantId: String(ratePlan.variantId),
				ratePlanId: String(ratePlan.id),
			}
		}

		return null
	}
}
