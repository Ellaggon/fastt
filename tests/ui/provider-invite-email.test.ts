import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	classifyInvitationMailStatus,
	parseInvitationMailStatus,
} from "@/lib/email/invitationMailStatus"
import {
	buildProviderInvitationEmailContent,
	sendProviderInvitationEmail,
} from "@/lib/email/providerInvitationEmail"
import {
	isResendEmailConfigured,
	resolvePublicAppOrigin,
	sendTransactionalEmail,
} from "@/lib/email/sendTransactionalEmail"
import { createProviderInvitationToken } from "@/lib/provider-invitations"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S5-1 invite transactional email + deep-link accept", () => {
	it("builds invite email content with deep-link accept URL", () => {
		const content = buildProviderInvitationEmailContent({
			providerDisplayName: "Equipo Config",
			role: "admin",
			acceptUrl: "https://app.fastt.test/provider/invitations/accept?token=abc",
			expiresAt: new Date("2030-01-15T00:00:00.000Z"),
			kind: "create",
		})
		expect(content.subject).toContain("Equipo Config")
		expect(content.text).toContain("https://app.fastt.test/provider/invitations/accept?token=abc")
		expect(content.text).toContain("Administrador")
		expect(content.html).toContain("Aceptar invitación")
	})

	it("resolves public origin and logs email by default", async () => {
		expect(resolvePublicAppOrigin("http://localhost:4321/api/x")).toBe("http://localhost:4321")
		const result = await sendTransactionalEmail({
			to: "persona@example.com",
			subject: "Test",
			text: "Hola",
		})
		expect(result).toEqual({ ok: true, provider: "log" })
	})

	it("sends invite email best-effort with accept path", async () => {
		const token = createProviderInvitationToken()
		const result = await sendProviderInvitationEmail({
			to: "persona@example.com",
			providerDisplayName: "Equipo Config",
			role: "staff",
			token,
			requestUrl: "http://localhost:4321/api/provider/settings/invitations",
			kind: "create",
		})
		expect(result.ok).toBe(true)
		expect(result.provider).toBe("log")
		expect(result.acceptPath).toContain(encodeURIComponent(token))
		expect(result.acceptUrl).toContain("/provider/invitations/accept?token=")
	})

	it("wires create/resend to sendProviderInvitationEmail", () => {
		const api = read("src/pages/api/provider/settings/invitations.ts")
		expect(api).toContain("sendProviderInvitationEmail")
		expect(api).toContain('kind: "create"')
		expect(api).toContain('kind: "resend"')
		expect(api).toContain("emailSent:")
		expect(api).toContain("emailProvider:")
		expect(api).toContain("mailStatus")
		expect(api).toContain("classifyInvitationMailStatus")
	})
})

describe("S6-1 invite mail honesty", () => {
	it("classifies sent / logged / failed without claiming inbox delivery for log sink", () => {
		expect(classifyInvitationMailStatus({ ok: true, provider: "log" })).toBe("logged")
		expect(classifyInvitationMailStatus({ ok: true, provider: "resend" })).toBe("sent")
		expect(classifyInvitationMailStatus({ ok: false, provider: "resend" })).toBe("failed")
		expect(classifyInvitationMailStatus({ ok: false, provider: "log" })).toBe("failed")
		expect(parseInvitationMailStatus("sent")).toBe("sent")
		expect(parseInvitationMailStatus("logged")).toBe("logged")
		expect(parseInvitationMailStatus("failed")).toBe("failed")
		expect(parseInvitationMailStatus("nope")).toBeNull()
	})

	it("keeps invitation copy concise and documents EMAIL_* env", () => {
		const team = read("src/pages/provider/settings/team.astro")
		const permissions = read("src/lib/provider-permissions.ts")
		const envExample = read(".env.example")
		const api = read("src/pages/api/provider/settings/invitations.ts")

		expect(team).toContain("resolveInviteResultNotice")
		expect(team).toContain("Invitación enviada")
		expect(team).toContain("Invitación creada")
		expect(team).toContain("dentro de 14 días")
		expect(team).not.toContain("Enviamos el correo automáticamente")
		expect(team).toContain("Copiar enlace de aceptación")

		expect(permissions).toContain('admin: "Gestiona el perfil y las integraciones')

		expect(api).toContain('redirectToTeam(request, "invited", { mail: mailStatus })')
		expect(api).toContain('redirectToTeam(request, "resent", { mail: mailStatus })')

		expect(envExample).toContain("EMAIL_PROVIDER")
		expect(envExample).toContain("RESEND_API_KEY")
		expect(envExample).toContain("EMAIL_FROM")
		expect(envExample).toContain("PUBLIC_APP_URL")
	})
})

describe("S6-2 Resend staging/prod readiness", () => {
	it("sends via Resend when EMAIL_FROM is a verified-style domain", async () => {
		const prev = {
			EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
			RESEND_API_KEY: process.env.RESEND_API_KEY,
			EMAIL_FROM: process.env.EMAIL_FROM,
		}
		const prevFetch = globalThis.fetch
		try {
			process.env.EMAIL_PROVIDER = "resend"
			process.env.RESEND_API_KEY = "re_test"
			process.env.EMAIL_FROM = "Fastt <noreply@fastt.test>"
			expect(isResendEmailConfigured()).toBe(true)

			let captured: { from?: string; to?: string[] } | null = null
			globalThis.fetch = (async (_input: any, init?: any) => {
				captured = JSON.parse(String(init?.body ?? "{}")) as {
					from?: string
					to?: string[]
				}
				return new Response(JSON.stringify({ id: "re_ok" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
			}) as any

			const result = await sendTransactionalEmail({
				to: "persona@example.com",
				subject: "Invite",
				text: "Hello",
				html: "<p>Hello</p>",
			})
			expect(result).toEqual({ ok: true, provider: "resend", id: "re_ok" })
			expect(captured).not.toBeNull()
			expect(captured!.from).toBe("Fastt <noreply@fastt.test>")
			expect(captured!.to).toEqual(["persona@example.com"])
		} finally {
			globalThis.fetch = prevFetch
			for (const [key, value] of Object.entries(prev)) {
				if (value === undefined) delete process.env[key]
				else process.env[key] = value
			}
		}
	})

	it("documents verified domain + smoke script in .env.example", () => {
		const envExample = read(".env.example")
		expect(envExample).toContain("your-verified-domain")
		expect(envExample).toContain("smoke:invite-resend")
		expect(envExample).toContain("INVITE_SMOKE_TO")
		expect(envExample).toContain("check:email-staging")
		expect(envExample).toContain("test:invite-email")
	})
})
