import { createHash } from "node:crypto"

import { recordElevatedInternalSession } from "@/lib/auth/internalMfaSession"

/** Mirrors the session fingerprint derived from the access-token cookie in production. */
export async function elevateInternalTestSession(params: {
	userId: string
	accessToken: string
	expiresInSeconds?: number
}): Promise<void> {
	await recordElevatedInternalSession({
		userId: params.userId,
		sessionFingerprint: createHash("sha256").update(params.accessToken).digest("hex"),
		expiresInSeconds: params.expiresInSeconds ?? 15 * 60,
	})
}
