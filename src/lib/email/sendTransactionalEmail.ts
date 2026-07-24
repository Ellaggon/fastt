import { logger } from "@/lib/observability/logger"

export type TransactionalEmailPayload = {
	to: string
	subject: string
	text: string
	html?: string
	tags?: Record<string, string>
}

export type TransactionalEmailResult = {
	ok: boolean
	provider: "log" | "resend"
	id?: string
	error?: string
}

function resolveFromAddress(): string | null {
	const configured = String(process.env.EMAIL_FROM ?? "").trim()
	if (!configured) return null
	return configured
}

function isUnusableFromAddress(from: string): boolean {
	const lower = from.toLowerCase()
	return lower.includes("@fastt.local") || lower.endsWith(".local>") || lower.endsWith(".local")
}

function resolveProvider(): "log" | "resend" {
	const raw = String(process.env.EMAIL_PROVIDER ?? "log")
		.trim()
		.toLowerCase()
	if (raw === "resend") return "resend"
	return "log"
}

async function sendViaResend(
	payload: TransactionalEmailPayload
): Promise<TransactionalEmailResult> {
	const apiKey = String(process.env.RESEND_API_KEY ?? "").trim()
	if (!apiKey) {
		return { ok: false, provider: "resend", error: "missing_resend_api_key" }
	}

	const from = resolveFromAddress()
	if (!from) {
		return { ok: false, provider: "resend", error: "missing_email_from" }
	}
	if (isUnusableFromAddress(from)) {
		return { ok: false, provider: "resend", error: "invalid_email_from_local_domain" }
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: [payload.to],
			subject: payload.subject,
			text: payload.text,
			html: payload.html ?? undefined,
			tags: payload.tags
				? Object.entries(payload.tags).map(([name, value]) => ({ name, value }))
				: undefined,
		}),
	})

	const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string }
	if (!response.ok) {
		return {
			ok: false,
			provider: "resend",
			error: String(body.message || `resend_http_${response.status}`),
		}
	}
	return { ok: true, provider: "resend", id: body.id }
}

/**
 * Thin transactional email sender.
 * Default sink: structured log (local/dev). Optional: Resend when EMAIL_PROVIDER=resend.
 * Staging/prod: set EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM (verified domain), PUBLIC_APP_URL.
 */
export async function sendTransactionalEmail(
	payload: TransactionalEmailPayload
): Promise<TransactionalEmailResult> {
	const to = String(payload.to ?? "")
		.trim()
		.toLowerCase()
	const subject = String(payload.subject ?? "").trim()
	const text = String(payload.text ?? "").trim()
	if (!to || !subject || !text) {
		return { ok: false, provider: "log", error: "invalid_email_payload" }
	}

	const provider = resolveProvider()
	if (provider === "resend") {
		const result = await sendViaResend({ ...payload, to, subject, text }).catch((error) => ({
			ok: false as const,
			provider: "resend" as const,
			error: error instanceof Error ? error.message : String(error),
		}))
		if (!result.ok) {
			logger.warn("email.send.failed", {
				provider: result.provider,
				to,
				subject,
				error: result.error,
				tags: payload.tags ?? null,
			})
		} else {
			logger.info("email.send.ok", {
				provider: result.provider,
				to,
				subject,
				id: result.id ?? null,
				tags: payload.tags ?? null,
			})
		}
		return result
	}

	logger.info("email.send", {
		provider: "log",
		to,
		subject,
		textPreview: text.slice(0, 280),
		tags: payload.tags ?? null,
	})
	return { ok: true, provider: "log" }
}

/** True when Resend is selected and required env looks present (does not call the API). */
export function isResendEmailConfigured(): boolean {
	if (resolveProvider() !== "resend") return false
	const apiKey = String(process.env.RESEND_API_KEY ?? "").trim()
	const from = resolveFromAddress()
	return Boolean(apiKey && from && !isUnusableFromAddress(from))
}

/** Prefer PUBLIC_APP_URL, else request origin. */
export function resolvePublicAppOrigin(requestUrl: string | URL): string {
	const configured = String(process.env.PUBLIC_APP_URL ?? process.env.SITE_URL ?? "")
		.trim()
		.replace(/\/$/, "")
	if (configured.startsWith("http://") || configured.startsWith("https://")) {
		return configured
	}
	return new URL(requestUrl).origin
}
