import { providerRepository } from "@/container"
import type { AuthUser } from "./getUserFromRequest"
import { requireAuth } from "./requireAuth"

export async function requireProvider(
	request: Request,
	opts?: { unauthorizedResponse?: Response; forbiddenResponse?: Response }
): Promise<{ user: AuthUser; providerId: string }> {
	const user = await requireAuth(request, { unauthorizedResponse: opts?.unauthorizedResponse })

	const provider = await providerRepository.getProviderByEmail(user.email)
	const providerId = provider?.id ?? null

	if (!providerId) {
		throw (
			opts?.forbiddenResponse ??
			new Response(JSON.stringify({ error: "Provider not found" }), { status: 403 })
		)
	}

	return { user, providerId }
}
