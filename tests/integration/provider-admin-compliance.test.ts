import { describe, expect, it } from "vitest"
import { db, eq, ProviderAuditLog, User } from "astro:db"
import {
	loadProviderComplianceConsole,
	parseProviderComplianceQueueFilter,
} from "@/lib/provider-admin-compliance"
import { submitProviderDocument } from "@/lib/provider-documents"
import { createProviderPaymentAccount } from "@/lib/provider-payment-accounts"
import { upsertProviderTaxConfiguration } from "@/lib/provider-tax-configuration"
import { GET as complianceGet } from "@/pages/api/admin/providers/compliance"
import { POST as adminVerificationPost } from "@/pages/api/admin/providers/verification"
import { upsertProvider } from "../test-support/catalog-db-test-data"

type SupabaseTestUser = { id: string; email: string }

function withSupabaseAuthStub<T>(
	usersByToken: Record<string, SupabaseTestUser>,
	fn: () => Promise<T>,
	opts?: { adminEmails?: string }
) {
	const prevUrl = process.env.SUPABASE_URL
	const prevAnon = process.env.SUPABASE_ANON_KEY
	const prevAdmins = process.env.INTERNAL_ADMIN_EMAILS
	const prevFetch = globalThis.fetch

	process.env.SUPABASE_URL = "https://supabase.test"
	process.env.SUPABASE_ANON_KEY = "sb_publishable_test"
	if (opts?.adminEmails) process.env.INTERNAL_ADMIN_EMAILS = opts.adminEmails

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
		if (prevAdmins === undefined) delete process.env.INTERNAL_ADMIN_EMAILS
		else process.env.INTERNAL_ADMIN_EMAILS = prevAdmins
	})
}

function makeAuthedRequest(path: string, token: string, body?: string): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	headers.set("accept", "application/json")
	if (!body) return new Request(`http://localhost:4321${path}`, { headers })
	headers.set("Content-Type", "application/json")
	return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
}

describe("provider admin unified compliance console", () => {
	it("parses queue filters including legacy pending alias", () => {
		expect(parseProviderComplianceQueueFilter("all")).toBe("all")
		expect(parseProviderComplianceQueueFilter("verification")).toBe("verification")
		expect(parseProviderComplianceQueueFilter("pending")).toBe("verification")
		expect(parseProviderComplianceQueueFilter("audit")).toBe("audit")
		expect(parseProviderComplianceQueueFilter("nope")).toBe("all")
	})

	it("aggregates verification + fiscal + documents + payments queues and audit trail", async () => {
		const providerId = "provider_compliance_console"
		const ownerEmail = "compliance.owner@example.com"
		const ownerId = `user_${ownerEmail}`
		const adminToken = "t_compliance_admin"
		const adminEmail = "compliance.admin@fastt.test"
		const adminId = `user_${adminEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Compliance Console S.R.L.",
			displayName: "Compliance Console",
			ownerEmail,
		})
		await db.insert(User).values({
			id: adminId,
			email: adminEmail,
			username: "compliance_admin",
			registrationDate: new Date(),
		})

		await upsertProviderTaxConfiguration({
			providerId,
			actorUserId: ownerId,
			taxResidenceCountry: "CL",
			businessRegistrationNumber: "76.999.888-8",
			taxRegime: "general",
			invoicingMode: "platform_receipt",
		})
		await submitProviderDocument({
			providerId,
			actorUserId: ownerId,
			type: "business_registration",
			fileName: "nit.pdf",
			mimeType: "application/pdf",
			sizeBytes: 1200,
		})
		await createProviderPaymentAccount({
			providerId,
			actorUserId: ownerId,
			method: "bank_transfer",
			currency: "USD",
			accountHolderName: "Compliance Console S.R.L.",
			bankName: "Banco Compliance",
			country: "CL",
			accountIdentifier: "1122334455",
			payoutSchedule: "weekly",
		})

		const allQueues = await loadProviderComplianceConsole({ filter: "all" })
		expect(allQueues.counts.verification).toBeGreaterThanOrEqual(1)
		expect(allQueues.counts.fiscal).toBeGreaterThanOrEqual(1)
		expect(allQueues.counts.documents).toBeGreaterThanOrEqual(1)
		expect(allQueues.counts.payments).toBeGreaterThanOrEqual(1)
		expect(allQueues.counts.total).toBe(
			allQueues.counts.verification +
				allQueues.counts.fiscal +
				allQueues.counts.documents +
				allQueues.counts.payments
		)
		expect(allQueues.sections).toEqual({
			verification: true,
			fiscal: true,
			documents: true,
			payments: true,
			audit: true,
		})
		expect(allQueues.verification.some((row) => row.providerId === providerId)).toBe(true)
		expect(allQueues.fiscal.some((row) => row.providerId === providerId)).toBe(true)
		expect(allQueues.documents.some((row) => row.providerId === providerId)).toBe(true)
		expect(allQueues.payments.some((row) => row.providerId === providerId)).toBe(true)

		const fiscalOnly = await loadProviderComplianceConsole({ filter: "fiscal" })
		expect(fiscalOnly.sections.fiscal).toBe(true)
		expect(fiscalOnly.sections.verification).toBe(false)
		expect(fiscalOnly.verification).toEqual([])
		expect(fiscalOnly.documents).toEqual([])
		expect(fiscalOnly.payments).toEqual([])
		expect(fiscalOnly.fiscal.some((row) => row.providerId === providerId)).toBe(true)
		// Counts remain global KPIs even when a dimensional filter is active.
		expect(fiscalOnly.counts.documents).toBeGreaterThanOrEqual(1)

		await withSupabaseAuthStub(
			{ [adminToken]: { id: adminId, email: adminEmail } },
			async () => {
				const approveRes = await adminVerificationPost({
					request: makeAuthedRequest(
						"/api/admin/providers/verification",
						adminToken,
						JSON.stringify({ providerId, status: "approved" })
					),
				} as any)
				expect(approveRes.status).toBe(200)

				const complianceRes = await complianceGet({
					request: makeAuthedRequest(
						"/api/admin/providers/compliance?filter=audit",
						adminToken
					),
				} as any)
				expect(complianceRes.status).toBe(200)
				const payload = await complianceRes.json()
				expect(payload.filter).toBe("audit")
				expect(payload.sections.audit).toBe(true)
				expect(payload.sections.verification).toBe(false)
				expect(payload.counts.total).toBeGreaterThanOrEqual(3)
				expect(
					payload.audit.some(
						(row: { action: string; providerId: string }) =>
							row.action === "provider.verification.review" && row.providerId === providerId
					)
				).toBe(true)
			},
			{ adminEmails: adminEmail }
		)

		const auditRows = await db
			.select({ action: ProviderAuditLog.action })
			.from(ProviderAuditLog)
			.where(eq(ProviderAuditLog.providerId, providerId))
			.all()
		expect(auditRows.some((row) => row.action === "provider.verification.review")).toBe(true)
		expect(auditRows.some((row) => row.action === "provider.tax_configuration.upsert")).toBe(true)
		expect(auditRows.some((row) => row.action === "provider.document.submit")).toBe(true)
		expect(auditRows.some((row) => row.action === "provider.payment_account.create")).toBe(true)

		const afterApprove = await loadProviderComplianceConsole({ filter: "verification" })
		expect(afterApprove.verification.some((row) => row.providerId === providerId)).toBe(false)
	})

	it("rejects compliance summary for non-admin users", async () => {
		const token = "t_compliance_staff"
		const email = "compliance.staff@example.com"
		const userId = `user_${email}`

		await withSupabaseAuthStub({ [token]: { id: userId, email } }, async () => {
			const res = await complianceGet({
				request: makeAuthedRequest("/api/admin/providers/compliance", token),
			} as any)
			expect(res.status).toBe(403)
		})
	})
})
