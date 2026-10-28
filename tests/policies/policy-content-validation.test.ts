import { describe, expect, it, vi } from "vitest"

import { PolicyValidationError, validatePolicyContentForCategory } from "@/modules/policies/public"
import { POLICY_PRESET_CATALOG } from "@/data/policy/policy-presets"
import { createPolicyCapa6 } from "@/modules/policies/application/use-cases/capa6/create-policy"
import type { PolicyCommandRepositoryPortCapa6 } from "@/modules/policies/application/ports/PolicyCommandRepositoryPortCapa6"

describe("policies/policy content validation", () => {
	it("creates the 24-hour tour preset with both cutoffs intact", async () => {
		const commandRepo = {
			createPolicyGroup: vi.fn().mockResolvedValue({ groupId: "group" }),
			createPolicyVersion: vi.fn().mockResolvedValue({ policyId: "policy" }),
			replacePolicyRules: vi.fn().mockResolvedValue(undefined),
			replaceCancellationTiers: vi.fn().mockResolvedValue(undefined),
			createAuditLog: vi.fn().mockResolvedValue(undefined),
		} as unknown as PolicyCommandRepositoryPortCapa6
		await expect(
			createPolicyCapa6(
				{ commandRepo },
				{
					ownerProviderId: "provider",
					category: "Cancellation",
					policyPresetKey: "tour_flexible_24h",
				}
			)
		).resolves.toMatchObject({ policyId: "policy", category: "Cancellation" })
		expect(commandRepo.replaceCancellationTiers).toHaveBeenCalledWith({
			policyId: "policy",
			tiers: expect.arrayContaining([
				expect.objectContaining({ hoursBeforeDeparture: 24, penaltyAmount: 0 }),
				expect.objectContaining({ hoursBeforeDeparture: 0, penaltyAmount: 100 }),
			]),
		})
	})
	it("accepts every cancellation preset, including the tour's 24-hour cutoff", () => {
		for (const preset of POLICY_PRESET_CATALOG.filter((item) => item.category === "Cancellation")) {
			expect(() =>
				validatePolicyContentForCategory({
					category: "Cancellation",
					cancellationTiers: preset.cancellationTiers,
				})
			).not.toThrow()
		}
	})

	it("rejects duplicate effective cutoffs across hours and days", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "Cancellation",
				cancellationTiers: [
					{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 0 },
					{
						daysBeforeArrival: 0,
						hoursBeforeDeparture: 24,
						penaltyType: "percentage",
						penaltyAmount: 100,
					},
				],
			})
		).toThrow(PolicyValidationError)
	})

	it("orders hourly cutoffs independently of their input order", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "Cancellation",
				cancellationTiers: [
					{
						daysBeforeArrival: 0,
						hoursBeforeDeparture: 0,
						penaltyType: "percentage",
						penaltyAmount: 100,
					},
					{
						daysBeforeArrival: 0,
						hoursBeforeDeparture: 24,
						penaltyType: "percentage",
						penaltyAmount: 0,
					},
				],
			})
		).not.toThrow()
	})

	it("still rejects penalties that decrease as an hourly departure approaches", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "Cancellation",
				cancellationTiers: [
					{
						daysBeforeArrival: 0,
						hoursBeforeDeparture: 24,
						penaltyType: "percentage",
						penaltyAmount: 100,
					},
					{
						daysBeforeArrival: 0,
						hoursBeforeDeparture: 0,
						penaltyType: "percentage",
						penaltyAmount: 0,
					},
				],
			})
		).toThrow(PolicyValidationError)
	})
	it("rejects invalid cancellation tiers centrally", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "Cancellation",
				cancellationTiers: [
					{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 80 },
					{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 10 },
				],
			})
		).toThrow(PolicyValidationError)
	})

	it("requires structured payment rules for prepayment", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "Payment",
				rules: { paymentType: "prepayment" },
			})
		).toThrow(PolicyValidationError)

		expect(
			validatePolicyContentForCategory({
				category: "Payment",
				rules: { paymentType: "prepayment", prepaymentPercentage: 50 },
			}).rules
		).toEqual({ paymentType: "prepayment", prepaymentPercentage: 50 })
	})

	it("validates check-in times and ordering", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "CheckIn",
				rules: { checkInFrom: "23:00", checkInUntil: "15:00", checkOutUntil: "11:00" },
			})
		).toThrow(PolicyValidationError)
	})

	it("requires no-show percentage amount when percentage is selected", () => {
		expect(() =>
			validatePolicyContentForCategory({
				category: "NoShow",
				rules: { penaltyType: "percentage" },
			})
		).toThrow(PolicyValidationError)
	})
})
