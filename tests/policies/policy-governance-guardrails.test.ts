import { describe, expect, it, vi } from "vitest"

import { PolicyValidationError } from "@/modules/policies/public"
import {
	createPolicyCapa6,
	replacePolicyAssignmentCapa6,
} from "@/modules/policies/testing-public"

function commandRepo(overrides: Record<string, unknown> = {}) {
	return {
		getPolicyById: vi.fn(async () => null),
		getPolicyGroupById: vi.fn(async () => ({
			id: "grp_1",
			category: "Payment",
			ownerProviderId: "prov_1",
		})),
		getMaxPolicyVersionByGroupId: vi.fn(async () => 0),
		createPolicyGroup: vi.fn(async () => ({ groupId: "grp_1" })),
		createPolicyVersion: vi.fn(async () => ({ policyId: "pol_1" })),
		replacePolicyRules: vi.fn(async () => undefined),
		replaceCancellationTiers: vi.fn(async () => undefined),
		listActivePoliciesByGroupId: vi.fn(async () => []),
		createAuditLog: vi.fn(async () => undefined),
		...overrides,
	} as any
}

describe("policies/governance guardrails", () => {
	it("blocks active policy creation without owner provider", async () => {
		const repo = commandRepo()

		await expect(
			createPolicyCapa6({ commandRepo: repo }, {
				category: "Payment",
				description: "Unowned payment policy",
				rules: { paymentType: "pay_at_property" },
			} as any)
		).rejects.toBeInstanceOf(PolicyValidationError)
		expect(repo.createPolicyGroup).not.toHaveBeenCalled()
		expect(repo.createPolicyVersion).not.toHaveBeenCalled()
	})

	it("blocks assigning an active policy when its group has no owner provider", async () => {
		const repo = commandRepo({
			getPolicyById: vi.fn(async () => ({
				id: "pol_unowned",
				groupId: "grp_unowned",
				category: "Payment",
				status: "active",
				version: 1,
				effectiveFrom: null,
				effectiveTo: null,
			})),
			getPolicyGroupById: vi.fn(async () => ({
				id: "grp_unowned",
				category: "Payment",
				ownerProviderId: "",
			})),
		})
		const assignmentRepo = {
			resolveScopeContext: vi.fn(async () => ({
				providerId: "prov_1",
				productId: "prod_1",
			})),
			replaceActiveAssignment: vi.fn(async () => ({
				assignmentId: "asg_1",
				replaced: false,
			})),
		} as any

		await expect(
			replacePolicyAssignmentCapa6(
				{ commandRepo: repo, assignmentRepo },
				{ policyId: "pol_unowned", scope: "product", scopeId: "prod_1", channel: null }
			)
		).rejects.toBeInstanceOf(PolicyValidationError)
		expect(assignmentRepo.replaceActiveAssignment).not.toHaveBeenCalled()
	})

	it("blocks Payment policy creation without contractual rules", async () => {
		await expect(
			createPolicyCapa6({ commandRepo: commandRepo() }, {
				ownerProviderId: "prov_1",
				category: "Payment",
				description: "Missing rules",
			} as any)
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("blocks Cancellation policy creation without tiers", async () => {
		await expect(
			createPolicyCapa6({ commandRepo: commandRepo() }, {
				ownerProviderId: "prov_1",
				category: "Cancellation",
				description: "Missing tiers",
			} as any)
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("audits policy creation and delegates atomic assignment replacement", async () => {
		const repo = commandRepo({
			getPolicyById: vi.fn(async () => ({
				id: "pol_1",
				groupId: "grp_1",
				category: "Payment",
				status: "active",
				version: 1,
				effectiveFrom: null,
				effectiveTo: null,
			})),
		})
		await createPolicyCapa6(
			{ commandRepo: repo },
			{
				ownerProviderId: "prov_1",
				category: "Payment",
				description: "Pay at property",
				rules: { paymentType: "pay_at_property" },
			}
		)

		const assignmentRepo = {
			resolveScopeContext: vi.fn(async () => ({
				providerId: "prov_1",
				productId: "prod_1",
			})),
			replaceActiveAssignment: vi.fn(async () => ({
				assignmentId: "asg_1",
				replaced: false,
			})),
		} as any
		await replacePolicyAssignmentCapa6({ commandRepo: repo, assignmentRepo }, {
			policyId: "pol_1",
			scope: "product",
			scopeId: "prod_1",
			channel: null,
		} as any)

		expect(repo.createAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: "policy_created", policyGroupId: "grp_1" })
		)
		expect(assignmentRepo.replaceActiveAssignment).toHaveBeenCalledWith(
			expect.objectContaining({
				policyId: "pol_1",
				policyGroupId: "grp_1",
				ownerProviderId: "prov_1",
			})
		)
	})
})
