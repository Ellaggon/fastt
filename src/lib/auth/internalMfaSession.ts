import { db, InternalSecuritySession } from "@/shared/infrastructure/db/compat"

export async function recordElevatedInternalSession(params: {
	userId: string
	sessionFingerprint: string
	expiresInSeconds: number
}): Promise<void> {
	const now = new Date()
	const expiresAt = new Date(now.getTime() + params.expiresInSeconds * 1000)
	await db
		.insert(InternalSecuritySession)
		.values({
			id: crypto.randomUUID(),
			userId: params.userId,
			sessionFingerprint: params.sessionFingerprint,
			mfaVerifiedAt: now,
			reauthenticatedAt: now,
			expiresAt,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: InternalSecuritySession.sessionFingerprint,
			set: {
				userId: params.userId,
				mfaVerifiedAt: now,
				reauthenticatedAt: now,
				expiresAt,
				updatedAt: now,
			},
		})
}
