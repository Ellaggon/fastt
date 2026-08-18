import type { SidebarDisclosureMode } from "@/lib/backoffice-governance"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import type { ProviderSessionSurface } from "@/lib/auth/authCache"
import { getUserFromRequest, type AuthUser } from "@/lib/auth/getUserFromRequest"
import { getProviderUserWorkspacePreferenceRead } from "@/lib/providerUserWorkspacePreference"
import type { ProviderWorkspaceCapabilities } from "@/lib/workspace/providerWorkspaceCapabilities"
import { resolveProviderWorkspaceCapabilities } from "@/lib/workspace/providerWorkspaceCapabilities"
import {
	getProviderSidebarData,
	type ProviderSidebarData,
} from "@/lib/dashboard/providerSidebarReadiness"

export type WorkspaceRequestContext = {
	user: AuthUser | null
	provider: ProviderSessionSurface | null
	sidebarDataPromise: Promise<ProviderSidebarData | null>
	workspaceExperience: "essential" | "professional"
	showProfessionalToggle: boolean
}

export type WorkspaceShellContext = {
	user: AuthUser | null
	provider: ProviderSessionSurface | null
	sidebarData: ProviderSidebarData | null
	workspaceExperience: "essential" | "professional"
	effectiveWorkspaceExperience: "essential" | "professional"
	workspaceCapabilities: ProviderWorkspaceCapabilities
	workspaceExperienceLockedReason: string | null
	disclosureMode: SidebarDisclosureMode
	showProfessionalToggle: boolean
}

export async function buildWorkspaceRequestContext(
	request: Request
): Promise<WorkspaceRequestContext> {
	const user = await getUserFromRequest(request)
	const provider = user ? await getProviderSessionSurfaceFromRequest(request, user) : null
	const userPreference =
		provider && user
			? await getProviderUserWorkspacePreferenceRead({
					providerId: provider.providerId,
					userId: user.id,
				})
			: null
	const workspaceExperience = userPreference?.schemaAvailable
		? userPreference.experience
		: "essential"
	const sidebarDataPromise = provider
		? getProviderSidebarData(provider.providerId, {
				userId: user?.id,
				providerRole: provider.role,
				workspaceExperience,
			})
				.then((value) => value)
				.catch(() => null)
		: Promise.resolve(null)

	return {
		user,
		provider,
		sidebarDataPromise,
		workspaceExperience,
		showProfessionalToggle: Boolean(provider),
	}
}

export async function resolveWorkspaceShellContext(
	context: WorkspaceRequestContext
): Promise<WorkspaceShellContext> {
	const sidebarData = await context.sidebarDataPromise
	const fallbackCapabilities = resolveProviderWorkspaceCapabilities({
		ratePlanCount: 0,
		variantCount: 0,
		activePriceRuleCount: 0,
		activeRestrictionCount: 0,
	})
	const effectiveWorkspaceExperience =
		sidebarData?.experience?.effective ?? context.workspaceExperience
	const disclosureMode =
		sidebarData?.disclosureMode ??
		(effectiveWorkspaceExperience === "professional" ? "professional-tools" : "small-provider")

	return {
		user: context.user,
		provider: context.provider,
		sidebarData,
		workspaceExperience: context.workspaceExperience,
		effectiveWorkspaceExperience,
		workspaceCapabilities: sidebarData?.capabilities ?? fallbackCapabilities,
		workspaceExperienceLockedReason: sidebarData?.experience?.lockedReason ?? null,
		disclosureMode,
		showProfessionalToggle: context.showProfessionalToggle,
	}
}
