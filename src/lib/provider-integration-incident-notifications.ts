import {
	and,
	db,
	eq,
	Provider,
	ProviderIntegrationConnection,
	ProviderIntegrationIncident,
	sql,
} from "@/shared/infrastructure/db/compat"
import { sendTransactionalEmail } from "@/lib/email/sendTransactionalEmail"
import { logger } from "@/lib/observability/logger"

type IncidentSeverity = "info" | "warning" | "error" | "critical"
type IncidentNotificationStatus =
	| "pending"
	| "sent"
	| "partial"
	| "failed"
	| "skipped"
	| "not_configured"

type IncidentChannelResult = {
	channel: "email" | "slack"
	ok: boolean
	target: string
	error?: string
}

const NOTIFIABLE_SEVERITIES = new Set<IncidentSeverity>(["error", "critical"])

function envList(name: string): string[] {
	return String(process.env[name] ?? "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean)
}

function notificationCooldownMinutes(): number {
	const parsed = Number(process.env.PROVIDER_INTEGRATION_INCIDENT_NOTIFICATION_COOLDOWN_MINUTES)
	if (!Number.isFinite(parsed)) return 360
	return Math.min(24 * 60, Math.max(15, Math.trunc(parsed)))
}

function publicOrigin(): string {
	const configured = String(process.env.PUBLIC_APP_URL ?? process.env.SITE_URL ?? "")
		.trim()
		.replace(/\/$/, "")
	return configured.startsWith("http://") || configured.startsWith("https://")
		? configured
		: "http://localhost:4321"
}

function escapeHtml(value: unknown): string {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;")
}

function connectorLabel(connectorKey: unknown): string {
	const labels: Record<string, string> = {
		channel_manager: "Channel manager",
		external_calendars: "Calendarios externos",
		webhooks_api: "Webhooks y API",
		accounting_export: "Exportación contable",
	}
	return labels[String(connectorKey)] ?? String(connectorKey ?? "Integración")
}

function severityLabel(severity: unknown): string {
	const labels: Record<string, string> = {
		info: "Informativa",
		warning: "Advertencia",
		error: "Error",
		critical: "Crítica",
	}
	return labels[String(severity)] ?? String(severity ?? "Incidencia")
}

function shouldNotifyIncident(params: {
	severity: IncidentSeverity
	status: string
	notifiedAt: Date | null
	force?: boolean
}): boolean {
	if (params.force) return true
	if (!NOTIFIABLE_SEVERITIES.has(params.severity)) return false
	if (!params.notifiedAt) return true
	const cooldownMs = notificationCooldownMinutes() * 60_000
	return Date.now() - params.notifiedAt.getTime() >= cooldownMs
}

function buildIncidentMessage(params: {
	incident: typeof ProviderIntegrationIncident.$inferSelect
	provider: typeof Provider.$inferSelect | null
	connection: typeof ProviderIntegrationConnection.$inferSelect | null
}) {
	const providerName =
		String(params.provider?.displayName ?? params.provider?.legalName ?? "").trim() ||
		params.incident.providerId
	const connectorName = connectorLabel(params.connection?.connectorKey ?? params.incident.category)
	const actionUrl = params.incident.actionHref
		? `${publicOrigin()}${params.incident.actionHref}`
		: `${publicOrigin()}/provider/settings/integrations?mode=pro`
	const subject = `[Fastt] ${severityLabel(params.incident.severity)} en ${connectorName}: ${params.incident.title}`
	const lines = [
		`Proveedor: ${providerName}`,
		`Integración: ${connectorName}`,
		`Severidad: ${severityLabel(params.incident.severity)}`,
		`Código: ${params.incident.code}`,
		`Incidencia: ${params.incident.title}`,
		`Detalle: ${params.incident.description}`,
		`Veces vista: ${params.incident.occurrenceCount}`,
		`Acción: ${params.incident.actionLabel ?? "Revisar integración"}`,
		`Abrir: ${actionUrl}`,
	].join("\n")
	const html = `
		<p><strong>Proveedor:</strong> ${escapeHtml(providerName)}</p>
		<p><strong>Integración:</strong> ${escapeHtml(connectorName)}</p>
		<p><strong>Severidad:</strong> ${escapeHtml(severityLabel(params.incident.severity))}</p>
		<p><strong>Código:</strong> ${escapeHtml(params.incident.code)}</p>
		<p><strong>Incidencia:</strong> ${escapeHtml(params.incident.title)}</p>
		<p>${escapeHtml(params.incident.description)}</p>
		<p><strong>Veces vista:</strong> ${escapeHtml(params.incident.occurrenceCount)}</p>
		<p><a href="${escapeHtml(actionUrl)}">${escapeHtml(params.incident.actionLabel ?? "Revisar integración")}</a></p>
	`
	return { subject, text: lines, html, actionUrl, providerName, connectorName }
}

async function sendSlackIncidentNotification(params: {
	webhookUrl: string
	message: ReturnType<typeof buildIncidentMessage>
	incident: typeof ProviderIntegrationIncident.$inferSelect
}): Promise<IncidentChannelResult> {
	const response = await fetch(params.webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text: `${severityLabel(params.incident.severity)} en ${params.message.connectorName}: ${params.incident.title}`,
			blocks: [
				{
					type: "section",
					text: {
						type: "mrkdwn",
						text: `*${params.incident.title}*\n${params.incident.description}`,
					},
				},
				{
					type: "context",
					elements: [
						{
							type: "mrkdwn",
							text: `Proveedor: *${params.message.providerName}* · Integración: *${params.message.connectorName}* · Severidad: *${severityLabel(params.incident.severity)}*`,
						},
					],
				},
				{
					type: "actions",
					elements: [
						{
							type: "button",
							text: { type: "plain_text", text: params.incident.actionLabel ?? "Revisar" },
							url: params.message.actionUrl,
						},
					],
				},
			],
		}),
	})
	if (!response.ok) {
		return {
			channel: "slack",
			ok: false,
			target: "webhook",
			error: `slack_http_${response.status}`,
		}
	}
	return { channel: "slack", ok: true, target: "webhook" }
}

async function updateIncidentNotificationState(params: {
	incidentId: string
	status: IncidentNotificationStatus
	results: IncidentChannelResult[]
	error?: string | null
}) {
	const now = new Date()
	await db
		.update(ProviderIntegrationIncident)
		.set({
			notificationStatus: params.status,
			notificationChannelsJson: params.results,
			notifiedAt:
				params.status === "sent" || params.status === "partial" || params.status === "failed"
					? now
					: null,
			notificationError: params.error ? params.error.slice(0, 1000) : null,
			updatedAt: now,
		})
		.where(eq(ProviderIntegrationIncident.id, params.incidentId))
	await db.execute(sql`
		UPDATE "ProviderIntegrationIncident"
		SET "notificationAttemptCount" = "notificationAttemptCount" + 1
		WHERE "id" = ${params.incidentId}
	`)
}

export async function notifyProviderIntegrationIncident(params: {
	incidentId: string
	force?: boolean
}): Promise<{ status: IncidentNotificationStatus; results: IncidentChannelResult[] }> {
	const incident = await db
		.select()
		.from(ProviderIntegrationIncident)
		.where(eq(ProviderIntegrationIncident.id, params.incidentId))
		.then((rows) => rows[0] ?? null)
	if (!incident || incident.status !== "open") return { status: "skipped", results: [] }

	const severity = String(incident.severity ?? "warning") as IncidentSeverity
	if (!NOTIFIABLE_SEVERITIES.has(severity) && !params.force) {
		await db
			.update(ProviderIntegrationIncident)
			.set({
				notificationStatus: "skipped",
				notificationChannelsJson: [],
				notificationError: null,
				updatedAt: new Date(),
			})
			.where(eq(ProviderIntegrationIncident.id, incident.id))
		return { status: "skipped", results: [] }
	}
	if (
		!shouldNotifyIncident({
			severity,
			status: String(incident.status),
			notifiedAt: incident.notifiedAt ?? null,
			force: params.force,
		})
	) {
		return { status: "skipped", results: [] }
	}

	const emailRecipients = envList("PROVIDER_INTEGRATION_INCIDENT_EMAIL_TO")
	const slackWebhookUrl = String(
		process.env.PROVIDER_INTEGRATION_INCIDENT_SLACK_WEBHOOK_URL ?? ""
	).trim()
	if (!emailRecipients.length && !slackWebhookUrl) {
		await db
			.update(ProviderIntegrationIncident)
			.set({
				notificationStatus: "not_configured",
				notificationChannelsJson: [],
				notificationError: null,
				updatedAt: new Date(),
			})
			.where(eq(ProviderIntegrationIncident.id, incident.id))
		return { status: "not_configured", results: [] }
	}

	const [provider, connection] = await Promise.all([
		db
			.select()
			.from(Provider)
			.where(eq(Provider.id, incident.providerId))
			.then((rows) => rows[0] ?? null),
		db
			.select()
			.from(ProviderIntegrationConnection)
			.where(
				and(
					eq(ProviderIntegrationConnection.id, incident.connectionId),
					eq(ProviderIntegrationConnection.providerId, incident.providerId)
				)
			)
			.then((rows) => rows[0] ?? null),
	])
	const message = buildIncidentMessage({ incident, provider, connection })
	const results: IncidentChannelResult[] = []
	for (const recipient of emailRecipients) {
		const result = await sendTransactionalEmail({
			to: recipient,
			subject: message.subject,
			text: message.text,
			html: message.html,
			tags: {
				domain: "provider_integrations",
				incidentId: incident.id,
				providerId: incident.providerId,
				severity,
			},
		})
		results.push({
			channel: "email",
			ok: result.ok,
			target: recipient,
			error: result.error,
		})
	}
	if (slackWebhookUrl) {
		const result = await sendSlackIncidentNotification({
			webhookUrl: slackWebhookUrl,
			message,
			incident,
		}).catch((error) => ({
			channel: "slack" as const,
			ok: false,
			target: "webhook",
			error: error instanceof Error ? error.message : String(error),
		}))
		results.push(result)
	}

	const okCount = results.filter((result) => result.ok).length
	const status: IncidentNotificationStatus =
		okCount === results.length ? "sent" : okCount > 0 ? "partial" : "failed"
	const error = results
		.filter((result) => !result.ok)
		.map((result) => `${result.channel}:${result.error ?? "failed"}`)
		.join("; ")
	await updateIncidentNotificationState({
		incidentId: incident.id,
		status,
		results,
		error: error || null,
	})
	logger.info("provider.integration.incident.notification", {
		incidentId: incident.id,
		providerId: incident.providerId,
		status,
		channels: results.map((result) => result.channel),
	})
	return { status, results }
}
