import { expect, it } from "vitest"
import { principalHasPermission, type InternalPrincipal } from "@/lib/auth/internal-authorization"
import { canActivateTerritorialTransition, territorialTransitionPermission } from "@/lib/commercial-policy/territorial-transition-access"

it("allows the dedicated bundle capability without granting general publication or retirement", () => {
	const principal = { mode: "iam", user: { id: "synthetic" }, roles: ["bo_tour_territorial_transition"], grants: [{ roleKey: "bo_tour_territorial_transition", permission: territorialTransitionPermission, scopeType: "global", scopeId: null }] } as InternalPrincipal
	expect(canActivateTerritorialTransition(principal)).toBe(true)
	for (const permission of ["policy.publish", "commercial_policy.retire", "commercial_policy.policy.approve", "commercial_policy.finance.approve", "commercial_policy.tour_operations.approve"] as const)
		expect(principalHasPermission(principal, permission)).toBe(false)
	expect(canActivateTerritorialTransition({ ...principal, grants: [] })).toBe(false)
	expect(canActivateTerritorialTransition({ ...principal, mode: "legacy_allowlist" })).toBe(false)
})
