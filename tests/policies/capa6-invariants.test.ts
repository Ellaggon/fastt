import { describe, expect, it, vi } from "vitest"

import {
	createPolicyVersionCapa6,
	deactivatePolicyAssignmentCapa6,
	replacePolicyAssignmentCapa6,
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
			getPolicyGroupById: vi.fn(async () => ({
				id: "grp_1",
				category: "Payment",
				ownerProviderId: "prov_1",
			})),
			getMaxPolicyVersionByGroupId: vi.fn(async () => 1),
			listActivePoliciesByGroupId: vi.fn(async () => [
				{
					id: "pol_existing",
					version: 1,
					effectiveFrom: "2030-01-01",
					effectiveTo: "2030-01-31",
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
			getPolicyGroupById: vi.fn(async () => ({
				id: "grp_cancel",
				category: "Cancellation",
				ownerProviderId: "prov_1",
			})),
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

	it("rejects assignment replacement across provider ownership boundaries", async () => {
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
			getPolicyGroupById: vi.fn(async () => ({
				id: "grp_1",
				category: "Payment",
				ownerProviderId: "prov_1",
			})),
			createAuditLog: vi.fn(async () => undefined),
		} as any

		const assignmentRepo = {
			resolveScopeContext: vi.fn(async () => ({
				providerId: "prov_other",
				productId: "prod_1",
				variantId: "var_1",
				ratePlanId: "rp_1",
			})),
			replaceActiveAssignment: vi.fn(async () => ({
				assignmentId: "asg_1",
				replaced: false,
			})),
		} as any

		await expect(
			replacePolicyAssignmentCapa6(
				{ commandRepo, assignmentRepo },
				{
					policyId: "pol_1",
					scope: "rate_plan",
					scopeId: "rp_1",
					channel: null,
				}
			)
		).rejects.toBeInstanceOf(PolicyValidationError)
		expect(assignmentRepo.replaceActiveAssignment).not.toHaveBeenCalled()
	})

	it("deactivates assignments through the ownership-aware repository operation", async () => {
		const assignmentRepo = {
			deactivateAssignment: vi.fn(async () => ({
				assignmentId: "asg_toggle_1",
				deactivated: true,
			})),
		} as any

		const out = await deactivatePolicyAssignmentCapa6(
			{ assignmentRepo },
			{
				assignmentId: "asg_toggle_1",
				ownerProviderId: "prov_1",
				actorUserId: "ops_1",
			}
		)
		expect(out).toEqual({ assignmentId: "asg_toggle_1", deactivated: true })
		expect(assignmentRepo.deactivateAssignment).toHaveBeenCalledWith({
			assignmentId: "asg_toggle_1",
			ownerProviderId: "prov_1",
			actorUserId: "ops_1",
		})
	})
})
