import { and, db, eq, gt, InternalSecuritySession } from "@/shared/infrastructure/db/compat"

import { getSessionIdFromRequest, type AuthUser } from "./getUserFromRequest"

export async function requireRecentInternalAuthentication(params: {
	request: Request
	user: AuthUser
	maxAgeMs?: number
	requireMfa?: boolean
}): Promise<void> {
	const sessionFingerprint = getSessionIdFromRequest(params.request)
	if (!sessionFingerprint) {
		throw new Response(JSON.stringify({ error: "reauthentication_required" }), { status: 401 })
	}

	const now = new Date()
	const maxAgeMs = params.maxAgeMs ?? 15 * 60 * 1000
	const row = await db
		.select({
			mfaVerifiedAt: InternalSecuritySession.mfaVerifiedAt,
			reauthenticatedAt: InternalSecuritySession.reauthenticatedAt,
		})
		.from(InternalSecuritySession)
		.where(
			and(
				eq(InternalSecuritySession.userId, params.user.id),
				eq(InternalSecuritySession.sessionFingerprint, sessionFingerprint),
				gt(InternalSecuritySession.expiresAt, now)
			)
		)
		.then((rows) => rows[0])

	const reauthenticatedAt = row?.reauthenticatedAt?.getTime() ?? 0
	const mfaVerifiedAt = row?.mfaVerifiedAt?.getTime() ?? 0
	if (
		!row ||
		(params.requireMfa !== false && !mfaVerifiedAt) ||
		!reauthenticatedAt ||
		now.getTime() - reauthenticatedAt > maxAgeMs
	) {
		throw new Response(JSON.stringify({ error: "reauthentication_required" }), { status: 401 })
	}
}
