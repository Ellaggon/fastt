import { first, and, db, eq, ProviderUser } from "@/shared/infrastructure/db/compat"
import { cacheKeys } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import { providerRepository } from "@/container"
import {
	getCachedProviderSessionSurface,
	setCachedProviderId,
	setCachedProviderSessionSurface,
	type ProviderSessionSurface,
} from "./authCache"
import {
	getSessionIdFromRequest,
	getUserFromRequest,
	resolveLocalQaAuthUser,
	type AuthUser,
} from "./getUserFromRequest"
import {
	normalizeProviderRole,
	resolveProviderPermissions,
	type ProviderRole,
} from "@/lib/provider-permissions"

const LOCAL_QA_SURFACE_TTL_MS = 30_000
let localQaSurfaceCache: {
	key: string
	surface: ProviderSessionSurface
	expiresAt: number
} | null = null

async function readProviderSessionSurfaceByProviderId(params: {
	userId: string
	providerId: string
	skipHeal?: boolean
}): Promise<ProviderSessionSurface | null> {
	const healedRole = params.skipHeal
		? null
		: await providerRepository.healProviderUserRoleIfNeeded({
				providerId: params.providerId,
				userId: params.userId,
			})

	const row = await db
		.select({
			providerId: ProviderUser.providerId,
			role: ProviderUser.role,
			permissionsJson: ProviderUser.permissionsJson,
		})
		.from(ProviderUser)
		.where(
			and(eq(ProviderUser.providerId, params.providerId), eq(ProviderUser.userId, params.userId))
		)
		.then(first)
	if (!row?.providerId) return null
	const role: ProviderRole = healedRole ?? normalizeProviderRole(row.role)
	return {
		userId: params.userId,
		providerId: String(row.providerId),
		role,
		permissions: resolveProviderPermissions({
			role,
			permissionsJson: row.permissionsJson,
		}),
	}
}

async function readProviderSessionSurfaceByUser(
	user: AuthUser
): Promise<ProviderSessionSurface | null> {
	const providerByUserLink = await providerRepository.getProviderByUserId(user.id)
	if (providerByUserLink?.id) {
		return readProviderSessionSurfaceByProviderId({
			userId: user.id,
			providerId: providerByUserLink.id,
		})
	}

	const providerByEmailLink = await providerRepository.getProviderByUserEmail(user.email)
	if (!providerByEmailLink?.id) return null
	await providerRepository.ensureProviderUserOwnerLink({
		providerId: providerByEmailLink.id,
		userId: user.id,
	})
	return readProviderSessionSurfaceByProviderId({
		userId: user.id,
		providerId: providerByEmailLink.id,
	})
}

async function localQaSurface(
	request: Request,
	preloadedUser?: AuthUser | null
): Promise<ProviderSessionSurface | null> {
	if (process.env.NODE_ENV === "production" || process.env.LOCAL_QA_AUTH_ENABLED !== "true") {
		return null
	}
	const qaUser = preloadedUser ?? (await resolveLocalQaAuthUser(request))
	if (!qaUser?.id) return null
	const providerId = String(process.env.LOCAL_QA_PROVIDER_ID ?? "").trim()
	if (!providerId) return null
	const cacheKey = [qaUser.id, providerId, process.env.LOCAL_QA_PROVIDER_ROLE ?? "owner"].join(":")
	if (localQaSurfaceCache?.key === cacheKey && localQaSurfaceCache.expiresAt > Date.now()) {
		return localQaSurfaceCache.surface
	}

	// Keep ProviderUser in sync with the resolved QA identity (env id may be a stub).
	await providerRepository.ensureProviderUserOwnerLink({
		providerId,
		userId: qaUser.id,
	})

	const healed = await readProviderSessionSurfaceByProviderId({
		userId: qaUser.id,
		providerId,
		skipHeal: true,
	})
	if (healed) {
		const surface = healed
		localQaSurfaceCache = {
			key: cacheKey,
			surface,
			expiresAt: Date.now() + LOCAL_QA_SURFACE_TTL_MS,
		}
		return surface
	}

	const role = normalizeProviderRole(process.env.LOCAL_QA_PROVIDER_ROLE ?? "owner")
	const surface = {
		userId: qaUser.id,
		providerId,
		role,
		permissions: resolveProviderPermissions({ role }),
	}
	localQaSurfaceCache = {
		key: cacheKey,
		surface,
		expiresAt: Date.now() + LOCAL_QA_SURFACE_TTL_MS,
	}
	return surface
}

export async function getProviderSessionSurfaceFromRequest(
	request: Request,
	preloadedUser?: AuthUser | null
): Promise<ProviderSessionSurface | null> {
	// Mirror getUserFromRequest: local QA is a no-session fixture, never an override
	// for an authenticated user who is switching accounts or accepting an invitation.
	if (!getSessionIdFromRequest(request)) {
		const qaSurface = await localQaSurface(request, preloadedUser)
		if (qaSurface) return qaSurface
	}

	const user = preloadedUser ?? (await getUserFromRequest(request))
	if (!user?.id) return null
	const sessionId = getSessionIdFromRequest(request)
	const cached = await getCachedProviderSessionSurface({ sessionId, userId: user.id })
	// Owner/admin can use cache. Staff may be a stale false-negative after heal — re-read DB.
	if (cached && (cached.role === "owner" || cached.role === "admin")) return cached

	let surface: ProviderSessionSurface | null = null
	const legacyProviderKey = sessionId ? cacheKeys.authProviderBySession(sessionId) : null
	if (legacyProviderKey) {
		try {
			const legacyProviderId = await persistentCache.get(legacyProviderKey)
			if (typeof legacyProviderId === "string" && legacyProviderId.trim()) {
				surface = await readProviderSessionSurfaceByProviderId({
					userId: user.id,
					providerId: legacyProviderId.trim(),
				})
			}
		} catch {
			surface = null
		}
	}

	if (!surface) {
		surface = await readProviderSessionSurfaceByUser(user)
	}
	if (surface) {
		void setCachedProviderSessionSurface({ sessionId, surface }).catch(() => {})
		void setCachedProviderId({
			sessionId,
			userId: user.id,
			providerId: surface.providerId,
		}).catch(() => {})
	}
	return surface
}
