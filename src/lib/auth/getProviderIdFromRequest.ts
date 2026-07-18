import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { providerRepository } from "@/container"
import {
	getSessionIdFromRequest,
	getUserFromRequest,
	isLocalQaAuthLoggedOut,
	type AuthUser,
} from "./getUserFromRequest"

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
	if (
		process.env.NODE_ENV !== "production" &&
		process.env.LOCAL_QA_AUTH_ENABLED === "true" &&
		process.env.LOCAL_QA_PROVIDER_ID &&
		!isLocalQaAuthLoggedOut(request)
	) {
		return String(process.env.LOCAL_QA_PROVIDER_ID).trim() || null
	}

	const user = preloadedUser ?? (await getUserFromRequest(request))
	if (!user?.id) return null
	const sessionId = getSessionIdFromRequest(request)
	const sessionCacheKey = sessionId ? cacheKeys.authProviderBySession(sessionId) : null

	if (sessionCacheKey) {
		try {
			const cachedProviderId = await persistentCache.get(sessionCacheKey)
			const cachedProviderIdString = typeof cachedProviderId === "string" ? cachedProviderId : null
			if (cachedProviderIdString) {
				const linkedProvider = await providerRepository.getProviderByUserId(user.id)
				if (linkedProvider?.id === cachedProviderIdString) {
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
					return cachedProviderIdString
				}

				void persistentCache.del(sessionCacheKey).catch(() => {})
				if (linkedProvider?.id) {
					void persistentCache
						.set(sessionCacheKey, linkedProvider.id, cacheTtls.authProviderBySession)
						.catch(() => {})
					console.debug("cache", {
						key: sessionCacheKey,
						hit: false,
						durationMs: 0,
						reason: "provider_link_changed",
					})
					console.info(
						JSON.stringify({
							type: "provider_resolution",
							path: "provider_user_cache_replaced",
							userId: user.id,
						})
					)
					return linkedProvider.id
				}

				console.debug("cache", {
					key: sessionCacheKey,
					hit: false,
					durationMs: 0,
					reason: "stale_provider_id",
				})
				console.info(
					JSON.stringify({
						type: "provider_resolution",
						path: "provider_user_cache_stale",
						userId: user.id,
					})
				)
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
