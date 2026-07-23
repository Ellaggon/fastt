import { getProviderSessionSurfaceFromRequest } from "./providerSessionSurface"
import type { AuthUser } from "./getUserFromRequest"

/**
 * Compatibility helper used by existing pages/routes.
 *
 * Returns the providerId for the authenticated user, or null if:
 * - no authenticated user
 * - user is not associated to a provider
 */
export async function getProviderIdFromRequest(
	request: Request,
	preloadedUser?: AuthUser | null
): Promise<string | null> {
	return (await getProviderSessionSurfaceFromRequest(request, preloadedUser))?.providerId ?? null
}
