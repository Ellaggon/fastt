import { describe, expect, it } from "vitest"

import { POLICY_PRESET_CATALOG, resolvePolicyPreset } from "@/data/policy/policy-presets"
import { createPolicyCapa6, PolicyValidationError } from "@/modules/policies/public"

describe("policies/policy preset catalog", () => {
	it("models canonical OTA cancellation presets with structured rules", () => {
		const expectedKeys = [
			"flexible",
			"moderate",
			"limited",
			"firm",
			"strict_legacy",
			"long_term",
			"non_refundable",
		]

		for (const key of expectedKeys) {
			const preset = resolvePolicyPreset(key, "Cancellation")
			expect(preset?.category).toBe("Cancellation")
			expect(preset?.rules).toEqual(
				expect.objectContaining({
					cancellationPreset: key,
					stayLengthThresholdNights: 28,
					refundTiers: expect.any(Array),
				})
			)
			expect(preset?.cancellationTiers?.length).toBeGreaterThan(0)
		}

		expect(POLICY_PRESET_CATALOG.filter((item) => item.category === "Cancellation")).toHaveLength(7)
		expect(resolvePolicyPreset("long_term", "Cancellation")?.rules).toEqual(
			expect.objectContaining({
				minStayNights: 28,
				stayLengthType: "long_stay",
				taxRefundProration: "same_as_room_refund",
				hostPayoutBasis: "collected_less_refund",
			})
		)
		expect(resolvePolicyPreset("flexible", "Cancellation")?.rules).toEqual(
			expect.objectContaining({
				maxStayNights: 27,
				gracePeriodHoursAfterBooking: 24,
				gracePeriodRequiresDaysBeforeArrival: 2,
				taxesFeesBasis: "pro_rated",
			})
		)
	})

	it("creates a policy from a preset without hand-written rules or descriptions", async () => {
		const created = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Cancellation",
			policyPresetKey: "limited",
		})

		expect(created.category).toBe("Cancellation")
		expect(created.version).toBe(1)
	})

	it("rejects unknown presets instead of silently creating empty contracts", async () => {
		await expect(
			createPolicyCapa6({
				ownerProviderId: "prov_test",
				category: "Cancellation",
				policyPresetKey: "made_up_preset",
			})
		).rejects.toBeInstanceOf(PolicyValidationError)
	})
})
