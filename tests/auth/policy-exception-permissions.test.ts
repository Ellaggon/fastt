import { describe, expect, it } from "vitest"

import {
	permissionForPolicyExceptionCreate,
	permissionForPolicyExceptionMutation,
} from "@/lib/auth/policy-exception-permissions"

describe("policy exception permission boundaries", () => {
	it("allows editors to create drafts but requires publishing permission for an approved rule", () => {
		expect(permissionForPolicyExceptionCreate({ approvalStatus: "pending" })).toBe("policy.edit")
		expect(permissionForPolicyExceptionCreate({ approvalStatus: "approved" })).toBe(
			"policy.publish"
		)
	})

	it("requires publishing permission for changes to an effective policy", () => {
		expect(permissionForPolicyExceptionMutation("approve")).toBe("policy.publish")
		expect(permissionForPolicyExceptionMutation("set_active")).toBe("policy.publish")
		expect(permissionForPolicyExceptionMutation("rollback")).toBe("policy.publish")
	})

	it("keeps rejection in the editor permission", () => {
		expect(permissionForPolicyExceptionMutation("reject")).toBe("policy.edit")
	})
})
