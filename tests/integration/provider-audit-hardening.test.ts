import { describe, expect, it } from "vitest"
import { db, eq, ProviderAuditLog } from "astro:db"
import {
	connectProviderIntegration,
	revokeProviderIntegration,
} from "@/lib/provider-integrations"
import { POST as invitationsPost } from "@/pages/api/provider/settings/invitations"
import { POST as paymentAccountsPost } from "@/pages/api/provider/settings/payment-accounts"
import { POST as providerProfilePost } from "@/pages/api/providers/profile"
import { POST as taxConfigurationPost } from "@/pages/api/provider/settings/tax-configuration"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type SupabaseTestUser = { id: string; email: string }

function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	fn: () => Promise<T>
) {
	const prevUrl = process.env.SUPABASE_URL
	const prevAnon = process.env.SUPABASE_ANON_KEY
	const prevFetch = globalThis.fetch

	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"

	globalThis.fetch = (async (input: any, init?: any) => {
		const url = typeof input === "string" ? input : String(input?.url || "")
		const expected = `${process.env.SUPABASE_URL}/auth/v1/user`
		if (url !== expected) return new Response("fetch not mocked", { status: 500 })

		const headers = init?.headers
		const authHeader =
			typeof headers?.get === "function"
				? headers.get("Authorization") || headers.get("authorization")
				: headers?.Authorization || headers?.authorization
		const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "").trim() : ""
		const user = usersByToken[token]
		if (!user) return new Response("Unauthorized", { status: 401 })

		return new Response(JSON.stringify({ id: user.id, email: user.email }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})
	}) as any

	return fn().finally(() => {
		globalThis.fetch = prevFetch
		if (prevUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = prevUrl
		if (prevAnon === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = prevAnon
	})
}

function makeAuthedRequest(path: string, token: string, body?: FormData): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	headers.set("accept", "application/json")
	if (!body) return new Request(`http://localhost:4321${path}`, { headers })
	return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
}

async function listAudit(providerId: string) {
	return db
		.select({
			action: ProviderAuditLog.action,
			entityType: ProviderAuditLog.entityType,
			actorUserId: ProviderAuditLog.actorUserId,
			beforeJson: ProviderAuditLog.beforeJson,
			afterJson: ProviderAuditLog.afterJson,
			riskLevel: ProviderAuditLog.riskLevel,
		})
		.from(ProviderAuditLog)
		.where(eq(ProviderAuditLog.providerId, providerId))
		.all()
}

function expectSensitiveAudit(row: {
	actorUserId: string | null
	beforeJson: unknown
	afterJson: unknown
	riskLevel: string
}) {
	expect(row.actorUserId).toBeTruthy()
	expect(row.riskLevel).toMatch(/^(low|medium|high)$/)
	expect(row).toHaveProperty("beforeJson")
	expect(row).toHaveProperty("afterJson")
}

describe("provider sensitive audit hardening", () => {
	it("writes before/after, actor and risk for fiscal, integrations and team", async () => {
		const providerId = "provider_audit_hardening"
		const token = "t_audit_hardening"
		const email = "audit.hardening@example.com"
		const userId = `user_${email}`

		await upsertProvider({
			id: providerId,
			legalName: "Auditoria Endurecida S.R.L.",
			displayName: "Auditoria Endurecida",
			ownerEmail: email,
		})

		await withSupabaseAuthStub({ [token]: { id: userId, email } }, async () => {
			const profileForm = new FormData()
			profileForm.set("timezone", "America/Santiago")
			profileForm.set("defaultCurrency", "USD")
			profileForm.set("supportEmail", "soporte@audit.test")
			const profileRes = await providerProfilePost({
				request: makeAuthedRequest("/api/providers/profile", token, profileForm),
			} as any)
			expect(profileRes.status).toBe(200)

			const taxForm = new FormData()
			taxForm.set("status", "verified")
			taxForm.set("taxResidenceCountry", "CL")
			taxForm.set("businessRegistrationNumber", "76.123.456-0")
			taxForm.set("taxRegime", "general")
			taxForm.set("invoicingMode", "platform_receipt")
			const taxRes = await taxConfigurationPost({
				request: makeAuthedRequest(
					"/api/provider/settings/tax-configuration",
					token,
					taxForm
				),
			} as any)
			expect(taxRes.status).toBe(200)

			const inviteForm = new FormData()
			inviteForm.set("email", "cohost@audit.test")
			inviteForm.set("role", "admin")
			const inviteRes = await invitationsPost({
				request: makeAuthedRequest("/api/provider/settings/invitations", token, inviteForm),
			} as any)
			expect(inviteRes.status).toBe(201)
			const invited = await inviteRes.json()

			const cancelForm = new FormData()
			cancelForm.set("action", "cancel")
			cancelForm.set("id", invited.id)
			const cancelRes = await invitationsPost({
				request: makeAuthedRequest("/api/provider/settings/invitations", token, cancelForm),
			} as any)
			expect(cancelRes.status).toBe(200)
		})

		await connectProviderIntegration({
			providerId,
			currentUserId: userId,
			connectorKey: "webhooks_api",
			mode: "sandbox",
			scopes: ["webhooks:deliver"],
			credentialsRef: "vault://secret/webhooks",
		})
		await revokeProviderIntegration({
			providerId,
			currentUserId: userId,
			connectorKey: "webhooks_api",
		})

		await withSupabaseAuthStub({ [token]: { id: userId, email } }, async () => {
			const paymentForm = new FormData()
			paymentForm.set("method", "bank_transfer")
			paymentForm.set("currency", "USD")
			paymentForm.set("accountHolderName", "Auditoria Endurecida S.R.L.")
			paymentForm.set("bankName", "Banco Audit")
			paymentForm.set("country", "CL")
			paymentForm.set("accountIdentifier", "1234567890")
			paymentForm.set("payoutSchedule", "weekly")
			const paymentRes = await paymentAccountsPost({
				request: makeAuthedRequest(
					"/api/provider/settings/payment-accounts",
					token,
					paymentForm
				),
			} as any)
			expect(paymentRes.status).toBe(201)
		})

		const audit = await listAudit(providerId)

		const profileAudit = audit.find((row) => row.action === "provider.profile.upsert")
		expect(profileAudit).toBeTruthy()
		expectSensitiveAudit(profileAudit!)
		expect(profileAudit!.actorUserId).toBe(userId)
		expect(profileAudit!.afterJson).toMatchObject({
			timezone: "America/Santiago",
			defaultCurrency: "USD",
		})

		const paymentAudit = audit.find((row) => row.action === "provider.payment_account.create")
		expect(paymentAudit).toBeTruthy()
		expectSensitiveAudit(paymentAudit!)
		expect(paymentAudit!.riskLevel).toBe("high")
		expect(paymentAudit!.afterJson).toMatchObject({ status: "pending", currency: "USD" })

		const fiscalAudit = audit.find((row) => row.action === "provider.tax_configuration.upsert")
		expect(fiscalAudit).toBeTruthy()
		expectSensitiveAudit(fiscalAudit!)
		expect(fiscalAudit!.riskLevel).toBe("high")
		expect(fiscalAudit!.beforeJson).toBeNull()
		expect(fiscalAudit!.afterJson).toMatchObject({
			status: "pending",
			taxResidenceCountry: "CL",
		})

		const inviteCreate = audit.find((row) => row.action === "provider.invitation.create")
		expect(inviteCreate).toBeTruthy()
		expectSensitiveAudit(inviteCreate!)
		expect(inviteCreate!.beforeJson).toBeNull()
		expect(inviteCreate!.afterJson).toMatchObject({
			email: "cohost@audit.test",
			role: "admin",
			status: "pending",
		})

		const inviteCancel = audit.find((row) => row.action === "provider.invitation.cancel")
		expect(inviteCancel).toBeTruthy()
		expectSensitiveAudit(inviteCancel!)
		expect(inviteCancel!.beforeJson).toMatchObject({ status: "pending" })
		expect(inviteCancel!.afterJson).toMatchObject({ status: "canceled" })

		const connectAudit = audit.find((row) => row.action === "provider.integration.connect")
		expect(connectAudit).toBeTruthy()
		expectSensitiveAudit(connectAudit!)
		expect(connectAudit!.beforeJson).toBeNull()
		expect(connectAudit!.afterJson).toMatchObject({
			connectorKey: "webhooks_api",
			status: "pending",
			credentialsRef: "[redacted]",
		})

		const revokeAudit = audit.find((row) => row.action === "provider.integration.revoke")
		expect(revokeAudit).toBeTruthy()
		expectSensitiveAudit(revokeAudit!)
		expect(revokeAudit!.riskLevel).toBe("high")
		expect(revokeAudit!.beforeJson).toMatchObject({
			status: "pending",
			credentialsRef: "[redacted]",
		})
		expect(revokeAudit!.afterJson).toMatchObject({
			status: "revoked",
			credentialsRef: null,
		})
	})
})
