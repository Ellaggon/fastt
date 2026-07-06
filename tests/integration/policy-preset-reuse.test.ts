import { and, db, eq, Policy, PolicyGroup } from "astro:db"
import { describe, expect, it } from "vitest"

import { getOrCreateProviderPresetPolicy } from "@/lib/policies/getOrCreateProviderPresetPolicy"
import { createPolicyCapa6 } from "@/modules/policies/public"

describe("integration/provider policy preset reuse", () => {
	it("reuses canonical presets but keeps customized content separate", async () => {
		const providerId = `provider_preset_${crypto.randomUUID()}`
		const customized = await createPolicyCapa6({
			ownerProviderId: providerId,
			category: "Payment",
			policyPresetKey: "prepayment_full",
			rules: {
				paymentType: "prepayment",
				prepaymentPercentage: 80,
				prepaymentDaysBeforeArrival: 0,
			},
		})

		const canonical = await getOrCreateProviderPresetPolicy({
			providerId,
			category: "Payment",
			policyPresetKey: "prepayment_full",
		})
		expect(canonical.reused).toBe(false)
		expect(canonical.groupId).not.toBe(customized.groupId)

		const reused = await getOrCreateProviderPresetPolicy({
			providerId,
			category: "Payment",
			policyPresetKey: "prepayment_full",
		})
		expect(reused).toEqual({
			policyId: canonical.policyId,
			groupId: canonical.groupId,
			reused: true,
		})

		const rows = await db
			.select({ groupId: PolicyGroup.id })
			.from(PolicyGroup)
			.innerJoin(Policy, eq(Policy.groupId, PolicyGroup.id))
			.where(
				and(
					eq(PolicyGroup.ownerProviderId, providerId),
					eq(Policy.policyPresetKey, "prepayment_full"),
					eq(Policy.status, "active")
				)
			)
			.all()
		expect(new Set(rows.map((row) => String(row.groupId))).size).toBe(2)
	})
})
