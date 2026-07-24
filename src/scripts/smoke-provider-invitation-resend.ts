/**
 * Staging/prod smoke: send one provider invitation email via Resend.
 *
 * Usage:
 *   pnpm smoke:invite-resend
 *   # or:
 *   EMAIL_PROVIDER=resend \
 *   RESEND_API_KEY=re_xxx \
 *   EMAIL_FROM="Fastt <noreply@your-verified-domain>" \
 *   PUBLIC_APP_URL=https://staging.example.com \
 *   INVITE_SMOKE_TO=you@example.com \
 *   npx tsx src/scripts/smoke-provider-invitation-resend.ts
 *
 * Exits 0 without sending when RESEND_API_KEY is missing (safe for CI).
 */
import "dotenv/config"
import {
	isResendEmailConfigured,
	resolvePublicAppOrigin,
	sendTransactionalEmail,
} from "../lib/email/sendTransactionalEmail"
import { buildProviderInvitationEmailContent } from "../lib/email/providerInvitationEmail"
import {
	buildProviderInvitationAcceptPath,
	createProviderInvitationToken,
} from "../lib/provider-invitations"

async function main() {
	const to = String(process.env.INVITE_SMOKE_TO ?? "")
		.trim()
		.toLowerCase()

	if (!String(process.env.RESEND_API_KEY ?? "").trim()) {
		console.log(
			JSON.stringify({
				ok: true,
				skipped: true,
				reason: "missing_resend_api_key",
				hint: "Set RESEND_API_KEY (+ EMAIL_PROVIDER=resend, EMAIL_FROM, PUBLIC_APP_URL) to run live smoke.",
			})
		)
		return
	}

	if (!isResendEmailConfigured()) {
		console.error(
			JSON.stringify({
				ok: false,
				error: "resend_not_configured",
				hint: "Need EMAIL_PROVIDER=resend, RESEND_API_KEY, and EMAIL_FROM on a verified (non-.local) domain.",
			})
		)
		process.exitCode = 1
		return
	}

	if (!to || !to.includes("@")) {
		console.error(
			JSON.stringify({
				ok: false,
				error: "missing_invite_smoke_to",
				hint: "Set INVITE_SMOKE_TO=you@example.com",
			})
		)
		process.exitCode = 1
		return
	}

	const token = createProviderInvitationToken()
	const origin = resolvePublicAppOrigin(
		String(process.env.PUBLIC_APP_URL || process.env.SITE_URL || "https://app.fastt.test")
	)
	const acceptPath = buildProviderInvitationAcceptPath(token)
	const acceptUrl = `${origin}${acceptPath}`
	const content = buildProviderInvitationEmailContent({
		providerDisplayName: "Fastt Smoke",
		role: "staff",
		acceptUrl,
		kind: "create",
	})

	const result = await sendTransactionalEmail({
		to,
		subject: `[smoke] ${content.subject}`,
		text: content.text,
		html: content.html,
		tags: { kind: "provider_invitation_smoke" },
	})

	console.log(
		JSON.stringify({
			ok: result.ok,
			provider: result.provider,
			id: result.id ?? null,
			error: result.error ?? null,
			to,
			acceptUrl,
			configured: isResendEmailConfigured(),
		})
	)

	if (!result.ok) process.exitCode = 1
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
