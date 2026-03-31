import { describe, it, expect } from "vitest"

import { db, PolicyGroup, Policy, PolicyAssignment, eq } from "astro:db"

import { resolveEffectivePoliciesUseCase } from "@/container/policies-resolution.container"

describe("integration/policies CAPA 6 Step 3 (remove hotel scope)", () => {
	it("a previously hotel-scoped assignment becomes resolvable after migrating to product scope", async () => {
		const productId = `prod_pol_${crypto.randomUUID()}`

		const groupId = `pg_${crypto.randomUUID()}`
		const policyId = `p_${crypto.randomUUID()}`
		const assignmentId = `pa_${crypto.randomUUID()}`

		// Seed PolicyGroup + Policy
		await db.insert(PolicyGroup).values({ id: groupId, category: "HouseRules" })
		await db.insert(Policy).values({
			id: policyId,
			groupId,
			description: "No smoking",
			version: 1,
			status: "active",
			effectiveFrom: null,
			effectiveTo: null,
		} as any)

		// Seed legacy hotel scope assignment (pre-migration state)
		await db.insert(PolicyAssignment).values({
			id: assignmentId,
			policyGroupId: groupId,
			scope: "hotel",
			scopeId: productId,
			channel: null,
			isActive: true,
		} as any)

		// Canonical resolver does not traverse "hotel" scope, so this must be empty pre-migration.
		const pre = await resolveEffectivePoliciesUseCase({ productId })
		expect(pre.policies).toEqual([])

		// Simulate data migration: hotel -> product
		await db
			.update(PolicyAssignment)
			.set({ scope: "product" })
			.where(eq(PolicyAssignment.id, assignmentId))

		// Now canonical resolution should succeed.
		const post = await resolveEffectivePoliciesUseCase({ productId })
		expect(post.policies).toHaveLength(1)
		expect(post.policies[0].category).toBe("HouseRules")
		expect(post.policies[0].policy.description).toBe("No smoking")
		expect(post.policies[0].resolvedFromScope).toBe("product")

		// And we should have no lingering hotel scope assignments (in this test DB).
		const lingering = await db
			.select()
			.from(PolicyAssignment)
			.where(eq(PolicyAssignment.scope, "hotel"))
		expect(lingering).toHaveLength(0)
	})
})
