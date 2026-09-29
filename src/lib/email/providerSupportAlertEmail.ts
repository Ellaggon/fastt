import {
	resolvePublicAppOrigin,
	sendTransactionalEmail,
	isResendEmailConfigured,
	type TransactionalEmailResult,
} from "@/lib/email/sendTransactionalEmail"
import { logger } from "@/lib/observability/logger"
import {
	supportLines,
	supportTopics,
	type SupportLine,
	type SupportTopic,
} from "@/lib/provider-support"

export type ProviderSupportAlertEvent = "new_request" | "provider_reply"

export function providerSupportAlertReadiness() {
	const recipient = String(process.env.PROVIDER_SUPPORT_ALERT_TO ?? "").trim()
	const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
	return {
		configured: validRecipient && isResendEmailConfigured(),
		recipientConfigured: validRecipient,
		deliveryConfigured: isResendEmailConfigured(),
	}
}

export function buildProviderSupportAlertEmailContent(params: {
	event: ProviderSupportAlertEvent
	requestId: string
	topic: SupportTopic
	line: SupportLine
	requestUrl: string | URL
}) {
	const reference = params.requestId.slice(0, 8).toUpperCase()
	const topic = supportTopics[params.topic]
	const line = supportLines[params.line]
	const requestPath = `/admin/support?status=open&request=${encodeURIComponent(params.requestId)}`
	const reviewUrl = `${resolvePublicAppOrigin(params.requestUrl)}${requestPath}`
	const subject =
		params.event === "new_request"
			? `Nueva consulta de proveedor · ${reference}`
			: `Nueva respuesta de proveedor · ${reference}`
	const text = [
		params.event === "new_request"
			? "Se recibió una nueva consulta de proveedor."
			: "Un proveedor respondió a una conversación pendiente.",
		`Motivo: ${topic}.`,
		`Negocio: ${line}.`,
		`Referencia: ${reference}.`,
		`Revisar en el Centro de Mando: ${reviewUrl}`,
		"La conversación y cualquier dato sensible deben gestionarse dentro de Fastt; este aviso no incluye el mensaje.",
	].join("\n\n")
	return { subject, text }
}

/** Best-effort notification. A mail failure never blocks support requests or replies. */
export async function notifyProviderSupportTeam(params: {
	event: ProviderSupportAlertEvent
	requestId: string
	topic: SupportTopic
	line: SupportLine
	requestUrl: string | URL
}): Promise<TransactionalEmailResult | null> {
	const readiness = providerSupportAlertReadiness()
	if (!readiness.configured) {
		logger.info("provider.support.alert.skipped", {
			reason: !readiness.recipientConfigured
				? "recipient_not_configured"
				: "email_delivery_not_configured",
			event: params.event,
			reference: params.requestId.slice(0, 8).toUpperCase(),
		})
		return null
	}
	const content = buildProviderSupportAlertEmailContent(params)
	const result = await sendTransactionalEmail({
		to: String(process.env.PROVIDER_SUPPORT_ALERT_TO).trim(),
		subject: content.subject,
		text: content.text,
		tags: { kind: `provider_support_${params.event}` },
	}).catch((error) => ({
		ok: false as const,
		provider: "resend" as const,
		error: error instanceof Error ? error.message : String(error),
	}))
	if (!result.ok) {
		logger.warn("provider.support.alert.failed", {
			event: params.event,
			reference: params.requestId.slice(0, 8).toUpperCase(),
			error: result.error,
		})
	}
	return result
}
