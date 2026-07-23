import {
	first,
	and,
	db,
	eq,
	ProviderProfile,
	ProviderUser,
} from "@/shared/infrastructure/db/compat"
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
	isLocalQaAuthLoggedOut,
	type AuthUser,
} from "./getUserFromRequest"
import { resolveProviderPermissions, type ProviderRole } from "@/lib/provider-permissions"

function normalizeRole(role: unknown): ProviderRole {
	if (role === "owner" || role === "admin" || role === "staff") return role
	return "staff"
}

async function readProviderSessionSurfaceByProviderId(params: {
	userId: string
	providerId: string
}): Promise<ProviderSessionSurface | null> {
	const row = await db
		.select({
			providerId: ProviderUser.providerId,
			role: ProviderUser.role,
			permissionsJson: ProviderUser.permissionsJson,
			professionalToolsEnabled: ProviderProfile.professionalToolsEnabled,
		})
		.from(ProviderUser)
		.leftJoin(ProviderProfile, eq(ProviderProfile.providerId, ProviderUser.providerId))
		.where(
			and(eq(ProviderUser.providerId, params.providerId), eq(ProviderUser.userId, params.userId))
		)
		.then(first)
	if (!row?.providerId) return null
	const role = normalizeRole(row.role)
	return {
		userId: params.userId,
		providerId: String(row.providerId),
		role,
		permissions: resolveProviderPermissions({
			role,
			permissionsJson: row.permissionsJson,
		}),
		professionalToolsEnabled: Boolean(row.professionalToolsEnabled),
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

function localQaSurface(request: Request): ProviderSessionSurface | null {
	if (process.env.NODE_ENV === "production") return null
	if (process.env.LOCAL_QA_AUTH_ENABLED !== "true") return null
	if (isLocalQaAuthLoggedOut(request)) return null
	const userId = String(process.env.LOCAL_QA_AUTH_USER_ID ?? "").trim()
	const providerId = String(process.env.LOCAL_QA_PROVIDER_ID ?? "").trim()
	if (!userId || !providerId) return null
	const role = normalizeRole(process.env.LOCAL_QA_PROVIDER_ROLE ?? "owner")
	return {
		userId,
		providerId,
		role,
		permissions: resolveProviderPermissions({ role }),
		professionalToolsEnabled: process.env.LOCAL_QA_PROFESSIONAL_TOOLS === "true",
	}
}

export async function getProviderSessionSurfaceFromRequest(
	request: Request,
	preloadedUser?: AuthUser | null
): Promise<ProviderSessionSurface | null> {
	const qaSurface = localQaSurface(request)
	if (qaSurface) return qaSurface

	const user = preloadedUser ?? (await getUserFromRequest(request))
	if (!user?.id) return null
	const sessionId = getSessionIdFromRequest(request)
	const cached = await getCachedProviderSessionSurface({ sessionId, userId: user.id })
	if (cached) return cached

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
