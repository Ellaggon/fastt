import { formatProviderRoleLabel } from "@/lib/provider-permissions"
import { buildProviderInvitationAcceptPath } from "@/lib/provider-invitations"
import {
	resolvePublicAppOrigin,
	sendTransactionalEmail,
	type TransactionalEmailResult,
} from "@/lib/email/sendTransactionalEmail"

export type ProviderInvitationEmailParams = {
	to: string
	providerDisplayName: string
	role: string
	token: string
	requestUrl: string | URL
	expiresAt?: Date | string | null
	kind?: "create" | "resend"
}

export function buildProviderInvitationEmailContent(params: {
	providerDisplayName: string
	role: string
	acceptUrl: string
	expiresAt?: Date | string | null
	kind?: "create" | "resend"
}) {
	const providerName = String(params.providerDisplayName || "un proveedor Fastt").trim()
	const roleLabel = formatProviderRoleLabel(params.role)
	const expiresLabel = params.expiresAt
		? new Date(params.expiresAt).toLocaleDateString("es-BO", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			})
		: "14 días"
	const isResend = params.kind === "resend"
	const subject = isResend
		? `Recordatorio: únete a ${providerName} en Fastt`
		: `Te invitaron a ${providerName} en Fastt`

	const text = [
		isResend
			? `Te reenviamos la invitación para unirte a ${providerName} en Fastt.`
			: `Te invitaron a unirte a ${providerName} en Fastt.`,
		`Rol: ${roleLabel}.`,
		`Abre este enlace (con el mismo correo de la invitación) para aceptar:`,
		params.acceptUrl,
		`El enlace caduca el ${expiresLabel}.`,
		`Si no esperabas este mensaje, puedes ignorarlo.`,
	].join("\n\n")

	const html = `
		<p>${isResend ? `Te reenviamos la invitación para unirte a <strong>${escapeHtml(providerName)}</strong> en Fastt.` : `Te invitaron a unirte a <strong>${escapeHtml(providerName)}</strong> en Fastt.`}</p>
		<p>Rol: <strong>${escapeHtml(roleLabel)}</strong>.</p>
		<p><a href="${escapeHtml(params.acceptUrl)}">Aceptar invitación</a></p>
		<p style="color:#64748b;font-size:14px;">Debes iniciar sesión con el mismo correo de la invitación. Caduca el ${escapeHtml(expiresLabel)}.</p>
		<p style="color:#94a3b8;font-size:12px;">Si no esperabas este mensaje, ignóralo.</p>
	`.trim()

	return { subject, text, html }
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
}

/**
 * Best-effort invite email. Never throws — invite create/resend must succeed even if mail fails.
 */
export async function sendProviderInvitationEmail(
	params: ProviderInvitationEmailParams
): Promise<TransactionalEmailResult & { acceptUrl: string; acceptPath: string }> {
	const origin = resolvePublicAppOrigin(params.requestUrl)
	const acceptPath = buildProviderInvitationAcceptPath(params.token)
	const acceptUrl = `${origin}${acceptPath}`

	const content = buildProviderInvitationEmailContent({
		providerDisplayName: params.providerDisplayName,
		role: params.role,
		acceptUrl,
		expiresAt: params.expiresAt,
		kind: params.kind,
	})

	const result = await sendTransactionalEmail({
		to: params.to,
		subject: content.subject,
		text: content.text,
		html: content.html,
		tags: {
			kind: params.kind === "resend" ? "provider_invitation_resend" : "provider_invitation",
			role: String(params.role || "staff"),
		},
	}).catch((error) => ({
		ok: false as const,
		provider: "log" as const,
		error: error instanceof Error ? error.message : String(error),
	}))

	return { ...result, acceptUrl, acceptPath }
}
