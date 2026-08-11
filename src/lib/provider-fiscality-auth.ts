import { requireProviderSessionSurface } from "@/lib/auth/requireProvider"

/** Fiscal identity and guest-facing taxes are provider-owner controls. */
export async function requireProviderFiscalityManager(request: Request) {
	const auth = await requireProviderSessionSurface(request)
	if (!auth.provider.permissions.canManageFiscality) {
		throw new Response(JSON.stringify({ error: "FISCALITY_PERMISSION_DENIED" }), {
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
