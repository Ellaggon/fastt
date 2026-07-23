import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import * as persistentCache from "@/lib/cache/persistentCache"
import type { ProviderPermissions, ProviderRole } from "@/lib/provider-permissions"
import type { AuthUser } from "./getUserFromRequest"

export type ProviderSessionSurface = {
	userId: string
	providerId: string
	role: ProviderRole
	permissions: ProviderPermissions
	professionalToolsEnabled: boolean
}

function normalizeUser(value: unknown): AuthUser | null {
	if (!value || typeof value !== "object") return null
	const user = value as { id?: unknown; email?: unknown }
	const id = String(user.id ?? "").trim()
	const email = String(user.email ?? "")
		.trim()
		.toLowerCase()
	if (!id || !email) return null
	return { id, email }
}

export async function getCachedAuthUser(sessionId: string | null): Promise<AuthUser | null> {
	if (!sessionId) return null
	try {
		return normalizeUser(await persistentCache.get(cacheKeys.authUserBySession(sessionId)))
	} catch {
		return null
	}
}

export async function setCachedAuthUser(
	sessionId: string | null,
	user: AuthUser | null
): Promise<void> {
	if (!sessionId || !user?.id || !user.email) return
	await persistentCache.set(
		cacheKeys.authUserBySession(sessionId),
		user,
		cacheTtls.authUserBySession
	)
}

export async function getCachedProviderId(params: {
	sessionId: string | null
	userId: string
}): Promise<string | null> {
	if (!params.sessionId || !params.userId) return null
	try {
		const cachedProviderId = await persistentCache.get(
			cacheKeys.authProviderByUserSession(params.userId, params.sessionId)
		)
		return typeof cachedProviderId === "string" && cachedProviderId.trim()
			? cachedProviderId.trim()
			: null
	} catch {
		return null
	}
}

export async function setCachedProviderId(params: {
	sessionId: string | null
	userId: string
	providerId: string | null
}): Promise<void> {
	if (!params.sessionId || !params.userId || !params.providerId) return
	await persistentCache.set(
		cacheKeys.authProviderByUserSession(params.userId, params.sessionId),
		params.providerId,
		cacheTtls.authProviderBySession
	)
}

function normalizeProviderSessionSurface(value: unknown): ProviderSessionSurface | null {
	if (!value || typeof value !== "object") return null
	const raw = value as Partial<ProviderSessionSurface>
	const userId = String(raw.userId ?? "").trim()
	const providerId = String(raw.providerId ?? "").trim()
	if (!userId || !providerId) return null
	const role =
		raw.role === "owner" || raw.role === "admin" || raw.role === "staff" ? raw.role : "staff"
	const permissions =
		raw.permissions && typeof raw.permissions === "object" ? raw.permissions : null
	if (!permissions) return null
	return {
		userId,
		providerId,
		role,
		permissions: permissions as ProviderPermissions,
		professionalToolsEnabled: Boolean(raw.professionalToolsEnabled),
	}
}

export async function getCachedProviderSessionSurface(params: {
	sessionId: string | null
	userId: string
}): Promise<ProviderSessionSurface | null> {
	if (!params.sessionId || !params.userId) return null
	try {
		return normalizeProviderSessionSurface(
			await persistentCache.get(cacheKeys.providerSessionSurface(params.userId, params.sessionId))
		)
	} catch {
		return null
	}
}

export async function setCachedProviderSessionSurface(params: {
	sessionId: string | null
	surface: ProviderSessionSurface | null
}): Promise<void> {
	if (!params.sessionId || !params.surface?.userId || !params.surface.providerId) return
	await persistentCache.set(
		cacheKeys.providerSessionSurface(params.surface.userId, params.sessionId),
		params.surface,
		cacheTtls.providerSessionSurface
	)
}

export async function invalidateAuthContextForUser(
	userId: string | null | undefined
): Promise<void> {
	const normalizedUserId = String(userId ?? "").trim()
	if (!normalizedUserId) return
	await persistentCache.delByPrefix(cacheKeys.authUserPrefix(normalizedUserId))
}

export async function invalidateLegacyAuthProviderSession(sessionId: string | null): Promise<void> {
	if (!sessionId) return
	await persistentCache.del(cacheKeys.authProviderBySession(sessionId))
}
