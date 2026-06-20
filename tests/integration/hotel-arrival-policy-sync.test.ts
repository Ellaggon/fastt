import { and, db, eq, Policy, PolicyAssignment, PolicyGroup, PolicyRule } from "astro:db"
import { describe, expect, it } from "vitest"

import { syncHotelArrivalPolicy } from "@/lib/policies/syncHotelArrivalPolicy"
import type { HouseRule } from "@/modules/house-rules/public"
import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

function arrivalRules(productId: string, checkInFrom: string): HouseRule[] {
	return [
		{
			id: crypto.randomUUID(),
			productId,
			type: "CheckIn",
			payloadJson: {
				kind: "CheckIn",
				method: "front_desk",
				checkInFrom,
				checkInUntil: "22:00",
			},
			createdAt: new Date().toISOString(),
		},
		{
			id: crypto.randomUUID(),
			productId,
			type: "Checkout",
			payloadJson: { kind: "Checkout", time: "11:00" },
			createdAt: new Date().toISOString(),
		},
	]
}

describe("hotel arrival policy synchronization", () => {
	it("creates one product-level contract and versions subsequent schedule changes", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `provider_arrival_${suffix}`
		const destinationId = `destination_arrival_${suffix}`
		const productId = `product_arrival_${suffix}`
		await upsertProvider({
			id: providerId,
			displayName: "Arrival provider",
			ownerEmail: `arrival-${suffix}@example.com`,
		})
		await upsertDestination({
			id: destinationId,
			name: "Arrival destination",
			type: "city",
			country: "BO",
			slug: `arrival-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Arrival hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})

		const first = await syncHotelArrivalPolicy({
			providerId,
			productId,
			actorUserId: `user_${suffix}`,
			rules: arrivalRules(productId, "15:00"),
		})
		expect(first.synced).toBe(true)

		const assignment = await db
			.select({ id: PolicyAssignment.id, groupId: PolicyAssignment.policyGroupId })
			.from(PolicyAssignment)
			.where(
				and(
					eq(PolicyAssignment.scope, "product"),
					eq(PolicyAssignment.scopeId, productId),
					eq(PolicyAssignment.category, "CheckIn"),
					eq(PolicyAssignment.isActive, true)
				)
			)
			.get()
		expect(assignment?.groupId).toBeTruthy()
		const group = await db
			.select({ ownerProviderId: PolicyGroup.ownerProviderId })
			.from(PolicyGroup)
			.where(eq(PolicyGroup.id, String(assignment?.groupId)))
			.get()
		expect(group?.ownerProviderId).toBe(providerId)

		await syncHotelArrivalPolicy({
			providerId,
			productId,
			actorUserId: `user_${suffix}`,
			rules: arrivalRules(productId, "14:00"),
		})

		const versions = await db
			.select({ id: Policy.id, version: Policy.version })
			.from(Policy)
			.where(eq(Policy.groupId, String(assignment?.groupId)))
			.all()
		expect(versions.map((row) => Number(row.version)).sort()).toEqual([1, 2])
		const latest = versions.find((row) => Number(row.version) === 2)
		const rules = await db
			.select({ key: PolicyRule.ruleKey, value: PolicyRule.ruleValue })
			.from(PolicyRule)
			.where(eq(PolicyRule.policyId, String(latest?.id)))
			.all()
		expect(Object.fromEntries(rules.map((row) => [row.key, row.value]))).toMatchObject({
			checkInFrom: "14:00",
			checkInUntil: "22:00",
			checkOutUntil: "11:00",
		})
	})
})
