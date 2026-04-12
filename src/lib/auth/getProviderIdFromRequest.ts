import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { providerRepository } from "@/container"
import { getSessionIdFromRequest, getUserFromRequest, type AuthUser } from "./getUserFromRequest"

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
	const user = preloadedUser ?? (await getUserFromRequest(request))
	if (!user?.id) return null
	const sessionId = getSessionIdFromRequest(request)
	const sessionCacheKey = sessionId ? cacheKeys.authProviderBySession(sessionId) : null

	if (sessionCacheKey) {
		try {
			const cachedProviderId = await persistentCache.get<string>(sessionCacheKey)
			if (cachedProviderId) {
				console.debug("cache", {
					key: sessionCacheKey,
					hit: true,
					durationMs: 0,
				})
				console.info(
					JSON.stringify({
						type: "provider_resolution",
						path: "provider_user_cache",
						userId: user.id,
					})
				)
				return cachedProviderId
			}
			console.debug("cache", {
				key: sessionCacheKey,
				hit: false,
				durationMs: 0,
			})
		} catch {
			// Cache is best-effort and must not block provider resolution.
		}
	}

	const providerByUserLink = await providerRepository.getProviderByUserId(user.id)
	if (providerByUserLink?.id) {
		if (sessionCacheKey) {
			void persistentCache
				.set(sessionCacheKey, providerByUserLink.id, cacheTtls.authProviderBySession)
				.catch(() => {})
		}
		console.info(
			JSON.stringify({
				type: "provider_resolution",
				path: "provider_user",
				userId: user.id,
			})
		)
		return providerByUserLink.id
	}

	console.info(
		JSON.stringify({
			type: "provider_resolution",
			path: "none",
			userId: user.id,
		})
	)
	return null
}
