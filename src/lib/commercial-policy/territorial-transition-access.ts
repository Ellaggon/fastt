import { principalHasPermission, type InternalPrincipal } from "@/lib/auth/internal-authorization"

export const territorialTransitionPermission =
	"commercial_policy.bo_tour_territorial_transition.apply" as const
const permissions = [
	"policy.publish",
	"commercial_policy.retire",
	"commercial_policy.policy.approve",
	"commercial_policy.finance.approve",
	"commercial_policy.tour_operations.approve",
] as const

/** The dedicated permission only authorizes the fixed, reconciled BO Tours bundle. */
export function canActivateTerritorialTransition(principal: InternalPrincipal) {
	return (
		principal.mode === "iam" &&
		(principalHasPermission(principal, territorialTransitionPermission) ||
			permissions.every((permission) => principalHasPermission(principal, permission)))
	)
}
