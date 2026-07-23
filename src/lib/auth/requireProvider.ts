import type { AuthUser } from "./getUserFromRequest"
import type { ProviderSessionSurface } from "./authCache"
import { getProviderSessionSurfaceFromRequest } from "./providerSessionSurface"
import { requireAuth } from "./requireAuth"

export async function requireProvider(
	request: Request,
	opts?: { unauthorizedResponse?: Response; forbiddenResponse?: Response }
): Promise<{ user: AuthUser; providerId: string }> {
	const user = await requireAuth(request, { unauthorizedResponse: opts?.unauthorizedResponse })

	const surface = await getProviderSessionSurfaceFromRequest(request, user)

	if (!surface?.providerId) {
		throw (
			opts?.forbiddenResponse ??
			new Response(JSON.stringify({ error: "Provider not found" }), { status: 403 })
		)
	}

	return { user, providerId: surface.providerId }
}

export async function requireProviderSessionSurface(
	request: Request,
	opts?: { unauthorizedResponse?: Response; forbiddenResponse?: Response }
): Promise<{ user: AuthUser; provider: ProviderSessionSurface }> {
	const user = await requireAuth(request, { unauthorizedResponse: opts?.unauthorizedResponse })
	const provider = await getProviderSessionSurfaceFromRequest(request, user)
	if (!provider?.providerId) {
		throw (
			opts?.forbiddenResponse ??
			new Response(JSON.stringify({ error: "Provider not found" }), { status: 403 })
		)
	}
	return { user, provider }
}
