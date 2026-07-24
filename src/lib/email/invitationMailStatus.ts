import type { TransactionalEmailResult } from "@/lib/email/sendTransactionalEmail"

/** How invite mail was actually delivered — drives honest host copy. */
export type InvitationMailStatus = "sent" | "logged" | "failed"

/**
 * Classify transactional send for invite UI.
 * - sent: real ESP (e.g. Resend) accepted the message
 * - logged: default log sink (local/dev) — no inbox delivery
 * - failed: send attempted but did not succeed
 */
export function classifyInvitationMailStatus(
	result: Pick<TransactionalEmailResult, "ok" | "provider">
): InvitationMailStatus {
	if (!result.ok) return "failed"
	if (result.provider === "log") return "logged"
	return "sent"
}

export function invitationMailQueryValue(status: InvitationMailStatus): string {
	return status
}

export function parseInvitationMailStatus(raw: unknown): InvitationMailStatus | null {
	const value = String(raw ?? "")
		.trim()
		.toLowerCase()
	if (value === "sent" || value === "logged" || value === "failed") return value
	return null
}
