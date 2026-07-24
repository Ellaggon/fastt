/**
 * Readiness check for staging/prod invite email (Resend).
 * Does not send mail. Exit 0 when configured; 1 when incomplete.
 *
 *   pnpm check:email-staging
 */
import "dotenv/config"
import {
	isResendEmailConfigured,
	resolvePublicAppOrigin,
} from "../lib/email/sendTransactionalEmail"

function present(name: string): boolean {
	return Boolean(String(process.env[name] ?? "").trim())
}

async function main() {
	const provider = String(process.env.EMAIL_PROVIDER ?? "log")
		.trim()
		.toLowerCase()
	const checks = {
		EMAIL_PROVIDER_resend: provider === "resend",
		RESEND_API_KEY: present("RESEND_API_KEY"),
		EMAIL_FROM: present("EMAIL_FROM"),
		PUBLIC_APP_URL_or_SITE_URL: present("PUBLIC_APP_URL") || present("SITE_URL"),
		isResendEmailConfigured: isResendEmailConfigured(),
	}

	const origin = resolvePublicAppOrigin(
		String(process.env.PUBLIC_APP_URL || process.env.SITE_URL || "http://localhost:4321")
	)
	const acceptExample = `${origin}/provider/invitations/accept?token=<token>`

	const ready = Object.values(checks).every(Boolean)
	const payload = {
		ok: ready,
		ready,
		checks,
		acceptDeepLinkExample: acceptExample,
		vercelHint: [
			"Vercel → Project → Settings → Environment Variables (Preview + Production):",
			"EMAIL_PROVIDER=resend",
			"RESEND_API_KEY=re_…",
			"EMAIL_FROM=Fastt <noreply@your-verified-domain.com>",
			"PUBLIC_APP_URL=https://your-staging-or-prod-host",
			"Then: pnpm smoke:invite-resend (with INVITE_SMOKE_TO=you@email.com)",
			"Manual E2E: invite from Equipo → open mail link → sign in as invitee → Accept",
		],
		testHint: "pnpm test:invite-email  # mocked Resend create→accept E2E",
	}

	console.log(JSON.stringify(payload, null, 2))
	if (!ready) process.exitCode = 1
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
