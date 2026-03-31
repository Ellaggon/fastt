import { providerRepository } from "@/container"
import { getUserFromRequest } from "./getUserFromRequest"

/**
 * Compatibility helper used by existing pages/routes.
 *
 * Returns the providerId for the authenticated user's email, or null if:
 * - no authenticated user
 * - user has no email
 * - user is not associated to a provider
 */
export async function getProviderIdFromRequest(request: Request): Promise<string | null> {
	const user = await getUserFromRequest(request)
	if (!user?.email) return null

	const provider = await providerRepository.getProviderByEmail(user.email)
	return provider?.id ?? null
}
