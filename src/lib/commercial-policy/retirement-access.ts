import { principalHasPermission, type InternalPrincipal } from "@/lib/auth/internal-authorization"

const redundantTeamVersions = new Set([
	"e25e3ba7-74a5-44dd-acd8-f143a5978c9d",
	"9bcce8ef-c13b-41e9-960b-5075749072d6",
])
const redundantGuideVersions = new Set([
	"7f284825-fc18-48b0-96ae-e4c9caea297c",
	"7a801716-97de-4d02-881b-ded388ccc0b8",
])

export function canRetireCommercialVersion(principal: InternalPrincipal, versionId: string) {
	return (
		principal.mode === "iam" &&
		(principalHasPermission(principal, "commercial_policy.retire") ||
			(redundantGuideVersions.has(versionId) &&
				principalHasPermission(principal, "commercial_policy.la_paz_guide_cleanup.retire")) ||
			(redundantTeamVersions.has(versionId) &&
				principalHasPermission(principal, "commercial_policy.la_paz_cleanup.retire")))
	)
}
