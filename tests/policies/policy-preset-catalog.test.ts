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
			"strict",
			"long_term",
			"non_refundable",
		]

		for (const key of expectedKeys) {
			const preset = resolvePolicyPreset(key, "Cancellation")
			expect(preset?.category).toBe("Cancellation")
			expect(preset?.rules).toEqual(
				expect.objectContaining({
					stayLengthThresholdNights: 28,
				})
			)
			expect(preset?.cancellationTiers?.length).toBeGreaterThan(0)
			for (const duplicatedKey of [
				"cancellationPreset",
				"stayLengthType",
				"freeCancellationUntilDaysBeforeArrival",
				"gracePeriodHoursAfterBooking",
				"refundBasis",
				"hostPayoutBasis",
				"refundTiers",
			]) {
				expect(preset?.rules).not.toHaveProperty(duplicatedKey)
			}
		}

		expect(POLICY_PRESET_CATALOG.filter((item) => item.category === "Cancellation")).toHaveLength(7)
		expect(resolvePolicyPreset("long_term", "Cancellation")?.rules).toEqual(
			expect.objectContaining({
				minStayNights: 28,
				taxRefundProration: "same_as_room_refund",
			})
		)
		expect(resolvePolicyPreset("long_term", "Cancellation")?.stayLengthType).toBe("long_stay")
		expect(resolvePolicyPreset("flexible", "Cancellation")?.rules).toEqual(
			expect.objectContaining({
				maxStayNights: 27,
				gracePeriodRequiresDaysBeforeArrival: 2,
				taxesFeesBasis: "pro_rated",
			})
		)
		expect(resolvePolicyPreset("flexible", "Cancellation")?.gracePeriod).toBe(24)
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
