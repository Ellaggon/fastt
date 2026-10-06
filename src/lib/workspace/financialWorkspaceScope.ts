import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"
import { getUserFromRequest } from "@/lib/auth/getUserFromRequest"
import { getProviderSidebarData } from "@/lib/dashboard/providerSidebarReadiness"
import { getProviderUserWorkspacePreferenceRead } from "@/lib/providerUserWorkspacePreference"
import { routes } from "@/lib/routes"
import {
	resolveWorkspaceScope,
	type WorkspaceScopeResolved,
} from "@/lib/workspace/resolveWorkspaceScope"
import { workspaceScopeInvalidResponse } from "@/lib/workspace/workspaceScopeInvalidResponse"
import { listProviderCommercialLines } from "@/lib/verification/commercial-lines"
import { db, eq, Product } from "@/shared/infrastructure/db/compat"

export type PreparedFinancialWorkspaceScope = {
	providerId: string
	scope: WorkspaceScopeResolved
	isSimpleFinancialView: boolean
}

export async function prepareFinancialWorkspaceScope(
	request: Request,
	url: URL
): Promise<PreparedFinancialWorkspaceScope | Response> {
	const user = await getUserFromRequest(request)
	if (!user) return new Response(null, { status: 302, headers: { Location: "/SignInPage" } })
	const providerId = await getProviderIdFromRequest(request, user)
	if (!providerId)
		return new Response(null, {
			status: 302,
			headers: { Location: routes.providerOnboardingStart() },
		})

	const workspacePreference = user.id
		? await getProviderUserWorkspacePreferenceRead({ providerId, userId: user.id })
		: null
	const [sidebarData, commercialLines, catalogProducts] = await Promise.all([
		getProviderSidebarData(providerId, {
			userId: user.id,
			workspaceExperience: workspacePreference?.schemaAvailable
				? workspacePreference.experience
				: undefined,
		}),
		listProviderCommercialLines(providerId).catch(() => []),
		db
			.select({ id: Product.id, name: Product.name, productType: Product.productType })
			.from(Product)
			.where(eq(Product.providerId, providerId)),
	])

	const isSimpleFinancialView = sidebarData.disclosureMode === "small-provider"
	const products = catalogProducts
		.map((row) => ({
			id: String(row.id),
			name: String(row.name || row.productType || "Servicio"),
			productType: String(row.productType ?? ""),
		}))
		.sort((left, right) => left.name.localeCompare(right.name, "es"))

	const requestedScope = url.searchParams.get("scope") ?? url.searchParams.get("vertical")
	const resolution = resolveWorkspaceScope({
		requestedScope,
		productId: url.searchParams.get("productId"),
		productTypes: sidebarData.productTypes ?? [],
		commercialLines: commercialLines.map((entry) => entry.line),
		products,
	})

	if (!resolution.valid) {
		return workspaceScopeInvalidResponse(resolution, {
			title: "Contexto financiero no válido",
			recoveryHref: "/financial?scope=all",
			recoveryLabel: "Volver a toda la operación financiera",
		})
	}

	return {
		providerId,
		scope: resolution,
		isSimpleFinancialView,
	}
}
