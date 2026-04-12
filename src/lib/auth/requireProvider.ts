import type { AuthUser } from "./getUserFromRequest"
import { getProviderIdFromRequest } from "./getProviderIdFromRequest"
import { requireAuth } from "./requireAuth"

export async function requireProvider(
	request: Request,
	opts?: { unauthorizedResponse?: Response; forbiddenResponse?: Response }
): Promise<{ user: AuthUser; providerId: string }> {
	const user = await requireAuth(request, { unauthorizedResponse: opts?.unauthorizedResponse })

	const providerId = await getProviderIdFromRequest(request)

	if (!providerId) {
		throw (
			opts?.forbiddenResponse ??
			new Response(JSON.stringify({ error: "Provider not found" }), { status: 403 })
		)
	}

	return { user, providerId }
}
