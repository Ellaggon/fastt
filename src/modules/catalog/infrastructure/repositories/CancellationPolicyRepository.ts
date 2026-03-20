import {
	db,
	eq,
	and,
	desc,
	Policy,
	CancellationTier,
	PolicyAssignment,
	PolicyGroup,
} from "astro:db"
import { randomUUID } from "node:crypto"
import type { CancellationPolicyRepositoryPort } from "../../application/ports/CancellationPolicyRepositoryPort"

export class CancellationPolicyRepository implements CancellationPolicyRepositoryPort {
	async createCancellationPolicy(params: { productId: string; name: string; tiers: unknown[] }) {
		const groupId = randomUUID()
		const policyId = randomUUID()

		await db.insert(PolicyGroup).values({
			id: groupId,
			category: "Cancellation",
		})

		await db.insert(Policy).values({
			id: policyId,
			groupId,
			description: String(params.name ?? ""),
			version: 1,
			status: "active",
		})

		await db.insert(PolicyAssignment).values({
			id: randomUUID(),
			policyGroupId: groupId,
			scope: "product",
			scopeId: params.productId,
			isActive: true,
		})

		for (const tier of (params.tiers as any) ?? []) {
			await db.insert(CancellationTier).values({
				id: randomUUID(),
				policyId,
				daysBeforeArrival: Number((tier as any).daysBeforeArrival),
				penaltyType: (tier as any).penaltyType,
				penaltyAmount: Number((tier as any).penaltyAmount ?? 0),
			})
		}
	}

	async getCancellationPolicies(productId: string): Promise<unknown[]> {
		const assignments = await db
			.select()
			.from(PolicyAssignment)
			.where(and(eq(PolicyAssignment.scope, "product"), eq(PolicyAssignment.scopeId, productId)))

		if (!assignments.length) return []

		const policies: any[] = []

		for (const a of assignments) {
			const policy = await db
				.select()
				.from(Policy)
				.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
				.where(and(eq(Policy.groupId, a.policyGroupId), eq(PolicyGroup.category, "Cancellation")))
				.orderBy(desc(Policy.version))
				.limit(1)

			if (!policy.length) continue

			const tiers = await db
				.select()
				.from(CancellationTier)
				.where(eq(CancellationTier.policyId, policy[0].Policy.id))

			policies.push({
				...policy[0].Policy,
				name: policy[0].Policy.description,
				tiers,
				assignmentId: a.id,
				isActive: a.isActive,
			})
		}

		return policies
	}

	async updateCancellationPolicy(params: { groupId: string; name: string; tiers: unknown[] }) {
		const last = await db
			.select()
			.from(Policy)
			.where(eq(Policy.groupId, params.groupId))
			.orderBy(desc(Policy.version))
			.limit(1)

		if (!last.length) return false

		const lastPolicy = last[0]

		await db
			.update(Policy)
			.set({ status: "archived" })
			.where(eq(Policy.id, (lastPolicy as any).id))

		const newPolicyId = randomUUID()

		await db.insert(Policy).values({
			id: newPolicyId,
			groupId: params.groupId,
			description: String(params.name ?? ""),
			version: (lastPolicy as any).version + 1,
			status: "active",
		})

		for (const tier of (params.tiers as any) ?? []) {
			await db.insert(CancellationTier).values({
				id: randomUUID(),
				policyId: newPolicyId,
				daysBeforeArrival: (tier as any).daysBeforeArrival,
				penaltyType: (tier as any).penaltyType,
				penaltyAmount: (tier as any).penaltyAmount ?? 0,
			})
		}

		return true
	}

	async toggleAssignment(params: { assignmentId: string; isActive: boolean }) {
		await db
			.update(PolicyAssignment)
			.set({ isActive: params.isActive })
			.where(eq(PolicyAssignment.id, params.assignmentId))
	}
}
