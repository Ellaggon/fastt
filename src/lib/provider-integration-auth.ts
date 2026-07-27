import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"

export async function requireProviderIntegrationManager(request: Request) {
	const auth = await requireProviderSessionSurface(request)
	if (!auth.provider.permissions.canManageIntegrations) {
		throw new Response(JSON.stringify({ error: "INTEGRATION_PERMISSION_DENIED" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		})
	}
	return {
		user: auth.user,
		providerId: auth.provider.providerId,
		provider: auth.provider,
	}
}
