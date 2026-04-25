import { describe, expect, it, vi } from "vitest"

import {
	createPolicyVersionCapa6,
	replacePolicyAssignmentCapa6,
	togglePolicyAssignmentCapa6,
} from "@/modules/policies/testing-public"
import { PolicyValidationError } from "@/modules/policies/public"

describe("policies/capa6 invariants (unit)", () => {
	it("rejects overlapping effective ranges when creating a new version", async () => {
		const repo = {
			getPolicyById: vi.fn(async () => ({
				id: "pol_prev",
				groupId: "grp_1",
				category: "Payment",
				status: "active",
				version: 1,
				effectiveFrom: null,
				effectiveTo: null,
			})),
			getPolicyGroupById: vi.fn(async () => ({ id: "grp_1", category: "Payment" })),
			getMaxPolicyVersionByGroupId: vi.fn(async () => 1),
			listActivePoliciesByGroupId: vi.fn(async () => [
				{
					id: "pol_existing",
					version: 1,
					effectiveFrom: "2030-01-01T00:00:00.000Z",
					effectiveTo: "2030-01-31T23:59:59.000Z",
				},
			]),
			createPolicyVersion: vi.fn(),
			replacePolicyRules: vi.fn(),
			replaceCancellationTiers: vi.fn(),
			createAuditLog: vi.fn(),
		} as any

		await expect(
			createPolicyVersionCapa6(
				{ commandRepo: repo },
				{
					previousPolicyId: "pol_prev",
					description: "new payment terms",
					rules: { paymentType: "pay_at_property" },
					effectiveFrom: "2030-01-10",
					effectiveTo: "2030-01-20",
				}
			)
		).rejects.toBeInstanceOf(PolicyValidationError)

		expect(repo.createPolicyVersion).not.toHaveBeenCalled()
	})

	it("rejects cancellation tier non-monotonic penalties", async () => {
		const repo = {
			getPolicyById: vi.fn(async () => ({
				id: "pol_prev",
				groupId: "grp_cancel",
				category: "Cancellation",
				status: "active",
				version: 1,
				effectiveFrom: null,
				effectiveTo: null,
			})),
			getPolicyGroupById: vi.fn(async () => ({ id: "grp_cancel", category: "Cancellation" })),
			getMaxPolicyVersionByGroupId: vi.fn(async () => 1),
			listActivePoliciesByGroupId: vi.fn(async () => []),
			createPolicyVersion: vi.fn(async () => ({ policyId: "pol_new" })),
			replacePolicyRules: vi.fn(async () => undefined),
			replaceCancellationTiers: vi.fn(async () => undefined),
			createAuditLog: vi.fn(async () => undefined),
		} as any

		await expect(
			createPolicyVersionCapa6(
				{ commandRepo: repo },
				{
					previousPolicyId: "pol_prev",
					description: "invalid cancellation",
					cancellationTiers: [
						{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 80 },
						{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 10 },
					],
				}
			)
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("rejects assignment replacement when required categories are missing", async () => {
		const commandRepo = {
			getPolicyById: vi.fn(async () => ({
				id: "pol_1",
				groupId: "grp_1",
				category: "Payment",
				status: "active",
				version: 2,
				effectiveFrom: null,
				effectiveTo: null,
			})),
			createAuditLog: vi.fn(async () => undefined),
		} as any

		const assignmentRepo = {
			scopeExists: vi.fn(async () => true),
			findActiveAssignmentByScopeCategoryChannel: vi.fn(async () => null),
			resolveScopeContext: vi.fn(async () => ({
				productId: "prod_1",
				variantId: "var_1",
				ratePlanId: "rp_1",
			})),
			deactivateAssignmentById: vi.fn(async () => undefined),
			createAssignment: vi.fn(async () => ({ assignmentId: "asg_1" })),
		} as any

		await expect(
			replacePolicyAssignmentCapa6(
				{
					commandRepo,
					assignmentRepo,
					resolveEffectivePolicies: async () => {
						throw new Error("MISSING_POLICY_CATEGORY:Cancellation,NoShow")
					},
				},
				{
					policyId: "pol_1",
					scope: "rate_plan",
					scopeId: "rp_1",
					channel: null,
					requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
					checkIn: "2030-02-01",
					checkOut: "2030-02-02",
				}
			)
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("toggles assignment active state deterministically", async () => {
		const assignmentRepo = {
			setAssignmentActiveById: vi.fn(async () => undefined),
		} as any

		const out = await togglePolicyAssignmentCapa6(
			{ assignmentRepo },
			{ assignmentId: "asg_toggle_1", isActive: false }
		)
		expect(out).toEqual({ assignmentId: "asg_toggle_1", isActive: false })
		expect(assignmentRepo.setAssignmentActiveById).toHaveBeenCalledWith("asg_toggle_1", false)
	})
})
