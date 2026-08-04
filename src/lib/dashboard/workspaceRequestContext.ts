import type { SidebarDisclosureMode } from "@/lib/backoffice-governance"
import { getProviderSessionSurfaceFromRequest } from "@/lib/auth/providerSessionSurface"
import type { ProviderSessionSurface } from "@/lib/auth/authCache"
import { getUserFromRequest, type AuthUser } from "@/lib/auth/getUserFromRequest"
import { getProfessionalModeCookiePreference } from "@/lib/dashboard/professionalModeCookie"
import {
	getProviderSidebarData,
	type ProviderSidebarData,
} from "@/lib/dashboard/providerSidebarReadiness"

export type WorkspaceRequestContext = {
	user: AuthUser | null
	provider: ProviderSessionSurface | null
	sidebarDataPromise: Promise<ProviderSidebarData | null>
	professionalToolsEnabled: boolean
	showProfessionalToggle: boolean
}

export type WorkspaceShellContext = {
	user: AuthUser | null
	provider: ProviderSessionSurface | null
	sidebarData: ProviderSidebarData | null
	professionalToolsEnabled: boolean
	disclosureMode: SidebarDisclosureMode
	showProfessionalToggle: boolean
}

export async function buildWorkspaceRequestContext(
	request: Request
): Promise<WorkspaceRequestContext> {
	const user = await getUserFromRequest(request)
	const provider = user ? await getProviderSessionSurfaceFromRequest(request, user) : null
	const cookiePreference = getProfessionalModeCookiePreference(request)
	const professionalToolsEnabled =
		typeof cookiePreference === "boolean"
			? cookiePreference
			: Boolean(provider?.professionalToolsEnabled)

	const sidebarDataPromise = provider
		? getProviderSidebarData(provider.providerId, {
				userId: user?.id,
				providerRole: provider.role,
				professionalToolsEnabled,
			})
				.then((value) => value)
				.catch(() => null)
		: Promise.resolve(null)

	return {
		user,
		provider,
		sidebarDataPromise,
		professionalToolsEnabled,
		showProfessionalToggle: Boolean(provider),
	}
}

export async function resolveWorkspaceShellContext(
	context: WorkspaceRequestContext
): Promise<WorkspaceShellContext> {
	const sidebarData = await context.sidebarDataPromise
	const disclosureMode =
		sidebarData?.disclosureMode ??
		(context.professionalToolsEnabled ? "professional-tools" : "small-provider")

	return {
		user: context.user,
		provider: context.provider,
		sidebarData,
		professionalToolsEnabled: context.professionalToolsEnabled,
		disclosureMode,
		showProfessionalToggle: context.showProfessionalToggle,
	}
}
