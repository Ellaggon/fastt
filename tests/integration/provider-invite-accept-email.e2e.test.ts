import { afterEach, describe, expect, it, vi } from "vitest"

// Production and test paths use the canonical Postgres adapter.
vi.mock("@/shared/infrastructure/db/compat", async () => {
	const astro = await import("@/shared/infrastructure/db/compat")
	const drizzle = await import("drizzle-orm")
	return {
		...drizzle,
		...astro,
		first: <T>(rows: readonly T[]) => rows[0],
		sql: drizzle.sql,
	}
})

import { db, eq, ProviderInvitation, ProviderUser, User } from "@/shared/infrastructure/db/compat"

import { POST as invitationsPost } from "@/pages/api/provider/settings/invitations"
import { POST as acceptPost } from "@/pages/api/provider/invitations/accept"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type SupabaseTestUser = { id: string; email: string }

type CapturedResendEmail = {
	from?: string
	to?: string[]
	subject?: string
	text?: string
	html?: string
}

const TEST_ENV_KEYS = [
	"EMAIL_PROVIDER",
	"RESEND_API_KEY",
	"EMAIL_FROM",
	"PUBLIC_APP_URL",
	"SITE_URL",
	"SUPABASE_URL",
	"SUPABASE_ANON_KEY",
	"LOCAL_QA_AUTH_ENABLED",
	"LOCAL_QA_AUTH_USER_ID",
	"LOCAL_QA_AUTH_EMAIL",
	"LOCAL_QA_PROVIDER_ID",
	"LOCAL_QA_PROVIDER_ROLE",
] as const

function snapshotEnv() {
	const snap: Record<string, string | undefined> = {}
	for (const key of TEST_ENV_KEYS) snap[key] = process.env[key]
	return snap
}

function restoreEnv(snap: Record<string, string | undefined>) {
	for (const key of TEST_ENV_KEYS) {
		const value = snap[key]
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
}

function disableLocalQaAuth() {
	delete process.env.LOCAL_QA_AUTH_ENABLED
	delete process.env.LOCAL_QA_AUTH_USER_ID
	delete process.env.LOCAL_QA_AUTH_EMAIL
	delete process.env.LOCAL_QA_PROVIDER_ID
	delete process.env.LOCAL_QA_PROVIDER_ROLE
}

function extractAcceptToken(payload: CapturedResendEmail): string | null {
	const blob = `${payload.html ?? ""}\n${payload.text ?? ""}`
	const match = blob.match(/[?&]token=([a-zA-Z0-9_-]+)/)
	return match?.[1] ?? null
}

function withAuthAndResendStub<T>(params: {
	usersByToken: Record<string, SupabaseTestUser>
	onResend?: (body: CapturedResendEmail) => void
	fn: () => Promise<T>
}) {
	const prevFetch = globalThis.fetch
	disableLocalQaAuth()
	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")

		if (url === "https://api.resend.com/emails") {
			const rawBody = typeof init?.body === "string" ? init.body : "{}"
			const parsed = JSON.parse(rawBody) as CapturedResendEmail
			params.onResend?.(parsed)
			return new Response(JSON.stringify({ id: "re_test_invite" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		}

		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) return new Response(`fetch not mocked: ${url}`, { status: 500 })

		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization
		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = params.usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })

		return new Response(JSON.stringify({ id: user.id, email: user.email }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as any

	return params.fn().finally(() => {
		globalThis.fetch = prevFetch
	})
}

function makeAuthedRequest(path: string, token: string, body?: FormData): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	if (!body) return new Request(`http://localhost:4321${path}`, { headers })
	return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
}

describe("S6-2 Resend invite create → acceptUrl → accept E2E", () => {
	const envSnap = snapshotEnv()

	afterEach(() => {
		restoreEnv(envSnap)
	})

	it("sends via mocked Resend and accepts with the emailed deep-link token", async () => {
		const providerId = "provider_invite_resend_e2e"
		const ownerToken = "t_invite_resend_owner"
		const inviteeToken = "t_invite_resend_invitee"
		const ownerEmail = "resend.owner@example.com"
		const inviteeEmail = "resend.invitee@example.com"
		const ownerId = `user_${ownerEmail}`
		const inviteeId = `user_${inviteeEmail}`

		process.env.EMAIL_PROVIDER = "resend"
		process.env.RESEND_API_KEY = "re_test_key"
		process.env.EMAIL_FROM = "Fastt <noreply@fastt.test>"
		process.env.PUBLIC_APP_URL = "https://app.fastt.test"

		await upsertProvider({
			id: providerId,
			legalName: "Resend E2E S.R.L.",
			displayName: "Resend E2E",
			ownerEmail,
		})
		await db.insert(User).values({ id: inviteeId, email: inviteeEmail }).onConflictDoNothing()

		let captured: CapturedResendEmail | null = null

		await withAuthAndResendStub({
			usersByToken: {
				[ownerToken]: { id: ownerId, email: ownerEmail },
				[inviteeToken]: { id: inviteeId, email: inviteeEmail },
			},
			onResend: (body) => {
				captured = body
			},
			fn: async () => {
				const createBody = new FormData()
				createBody.set("email", inviteeEmail)
				createBody.set("role", "staff")

				const createRes = await invitationsPost({
					request: makeAuthedRequest("/api/provider/settings/invitations", ownerToken, createBody),
				} as any)
				expect(createRes.status).toBe(201)
				const created = await createRes.json()
				expect(created.mailStatus).toBe("sent")
				expect(created.emailProvider).toBe("resend")
				expect(created.emailSent).toBe(true)
				expect(created.acceptPath).toMatch(/^\/provider\/invitations\/accept\?token=/)

				expect(captured).toBeTruthy()
				expect(captured?.from).toBe("Fastt <noreply@fastt.test>")
				expect(captured?.to).toEqual([inviteeEmail])
				expect(captured?.html || captured?.text).toContain(
					"https://app.fastt.test/provider/invitations/accept?token="
				)

				const emailedToken = extractAcceptToken(captured!)
				expect(emailedToken).toBeTruthy()
				expect(created.acceptPath).toContain(emailedToken)

				const acceptBody = new FormData()
				acceptBody.set("token", emailedToken!)
				const acceptRes = await acceptPost({
					request: makeAuthedRequest("/api/provider/invitations/accept", inviteeToken, acceptBody),
				} as any)
				expect(acceptRes.status).toBe(200)
				const accepted = await acceptRes.json()
				expect(accepted.ok).toBe(true)
				expect(accepted.providerId).toBe(providerId)
				expect(accepted.role).toBe("staff")

				const invitation = await db
					.select({ status: ProviderInvitation.status })
					.from(ProviderInvitation)
					.where(eq(ProviderInvitation.id, created.id))
					.then((rows) => rows[0])
				expect(invitation?.status).toBe("accepted")

				const link = await db
					.select({ role: ProviderUser.role })
					.from(ProviderUser)
					.where(eq(ProviderUser.userId, inviteeId))
					.then((rows) => rows[0])
				expect(link?.role).toBe("staff")
			},
		})
	})

	it("rejects Resend when EMAIL_FROM is missing or .local", async () => {
		const { sendTransactionalEmail } = await import("@/lib/email/sendTransactionalEmail")

		process.env.EMAIL_PROVIDER = "resend"
		process.env.RESEND_API_KEY = "re_test_key"
		delete process.env.EMAIL_FROM

		const missing = await sendTransactionalEmail({
			to: "a@example.com",
			subject: "x",
			text: "y",
		})
		expect(missing).toEqual({
			ok: false,
			provider: "resend",
			error: "missing_email_from",
		})

		process.env.EMAIL_FROM = "Fastt <noreply@fastt.local>"
		const local = await sendTransactionalEmail({
			to: "a@example.com",
			subject: "x",
			text: "y",
		})
		expect(local).toEqual({
			ok: false,
			provider: "resend",
			error: "invalid_email_from_local_domain",
		})
	})
})
