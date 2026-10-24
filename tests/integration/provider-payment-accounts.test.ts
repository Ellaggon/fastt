import { describe, expect, it } from "vitest"
import {
	db,
	eq,
	ProviderAuditLog,
	ProviderFinancialProfile,
	ProviderPaymentAccount,
	ProviderUser,
	CaseDecision,
	ComplianceCase,
	and,
	User,
} from "@/shared/infrastructure/db/compat"
import {
	GET as paymentAccountsGet,
	POST as paymentAccountsPost,
} from "@/pages/api/provider/settings/payment-accounts"
import { POST as adminPaymentAccountsPost } from "@/pages/api/admin/providers/payment-accounts"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { elevateInternalTestSession } from "../test-support/internal-mfa"
import {
	createProviderPaymentAccount,
	initiatePaymentAccountMicroDeposit,
} from "@/lib/provider-payment-accounts"
import { proposeCaseDecision } from "@/modules/casework/application/commands/case-commands"

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

function makeAuthedRequest(path: string, token: string, body?: FormData | string): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	headers.set("accept", "application/json")
	if (!body) return new Request(`http://localhost:4321${path}`, { headers })
	headers.set("Idempotency-Key", `test-command-${crypto.randomUUID()}`)
	if (typeof body === "string") {
		headers.set("Content-Type", "application/json")
		return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
	}
	return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
}

describe("provider payment accounts / payouts", () => {
	it("rejects an undocumented bank decision before persisting a proposal", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `provider_bank_evidence_${suffix}`
		const ownerEmail = `bank.evidence.${suffix}@example.com`
		const actorUserId = `user_${ownerEmail}`
		await upsertProvider({
			id: providerId,
			legalName: "Banco Evidencia",
			displayName: "Banco Evidencia",
			ownerEmail,
		})
		const account = await createProviderPaymentAccount({
			providerId,
			actorUserId,
			accountHolderName: "Banco Evidencia",
			bankName: "Banco Ejemplo",
			country: "BO",
			currency: "USD",
			accountIdentifier: "1234567890",
		})
		const [reviewCase] = await db
			.select()
			.from(ComplianceCase)
			.where(eq(ComplianceCase.sourceRef, account.id))
		expect(reviewCase).toBeTruthy()
		await expect(
			proposeCaseDecision({
				caseId: reviewCase.id,
				expectedVersion: reviewCase.version,
				decision: "approved",
				reasonCode: "requirements_satisfied",
				comment: "OK",
				actorUserId,
				evidenceSnapshot: {},
			})
		).rejects.toMatchObject({ message: "payment_review_evidence_required", status: 400 })
		expect(
			await db
				.select({ id: CaseDecision.id })
				.from(CaseDecision)
				.where(eq(CaseDecision.caseId, reviewCase.id))
		).toEqual([])
	})
	it("does not create a case for an account owned by another provider", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `provider_bank_owned_${suffix}`
		const otherProviderId = `provider_bank_other_${suffix}`
		const ownerEmail = `bank.owned.${suffix}@example.com`
		await upsertProvider({
			id: providerId,
			legalName: "Titular A",
			displayName: "Titular A",
			ownerEmail,
		})
		await upsertProvider({
			id: otherProviderId,
			legalName: "Titular B",
			displayName: "Titular B",
			ownerEmail: `bank.other.${suffix}@example.com`,
		})
		const actorUserId = `user_${ownerEmail}`
		const account = await createProviderPaymentAccount({
			providerId,
			actorUserId,
			accountHolderName: "Titular A",
			bankName: "Banco Ejemplo",
			country: "BO",
			currency: "USD",
			accountIdentifier: "1234567890",
		})
		await expect(
			initiatePaymentAccountMicroDeposit({
				providerId: otherProviderId,
				actorUserId,
				accountId: account.id,
			})
		).rejects.toMatchObject({ message: "not_found", status: 404 })
		expect(
			await db
				.select({ id: ComplianceCase.id })
				.from(ComplianceCase)
				.where(
					and(
						eq(ComplianceCase.providerId, otherProviderId),
						eq(ComplianceCase.sourceRef, account.id)
					)
				)
		).toEqual([])
	})
	it("allows only one pending account under simultaneous submissions", async () => {
		const suffix = crypto.randomUUID()
		const ownerEmail = `bank.concurrent.${suffix}@example.com`
		const providerId = `provider_bank_concurrent_${suffix}`
		await upsertProvider({
			id: providerId,
			legalName: "Banco Test",
			displayName: "Banco Test",
			ownerEmail,
		})
		const input = {
			providerId,
			actorUserId: `user_${ownerEmail}`,
			accountHolderName: "Banco Test",
			bankName: "Banco Ejemplo",
			country: "BO",
			currency: "USD",
			accountIdentifier: "1234567890",
		}
		const results = await Promise.allSettled([
			createProviderPaymentAccount(input),
			createProviderPaymentAccount(input),
		])
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
		const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult
		expect(failed.reason.status).toBe(409)
		const rows = await db
			.select({ status: ProviderPaymentAccount.status })
			.from(ProviderPaymentAccount)
			.where(eq(ProviderPaymentAccount.providerId, providerId))
		expect(rows.filter((row) => row.status === "pending")).toHaveLength(1)
	})
	it("lets an owner submit a bank account and only an internal admin verify it", async () => {
		const providerId = `provider_payment_accounts_flow_${crypto.randomUUID()}`
		const token = "t_payments_owner"
		const ownerEmail = `payments.owner.${crypto.randomUUID()}@example.com`
		const ownerId = `user_${ownerEmail}`
		const adminToken = "t_payments_admin"
		const adminEmail = "payments.admin@fastt.test"
		const adminId = `user_${adminEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Pagos Config S.R.L.",
			displayName: "Pagos Config",
			ownerEmail,
		})
		await db
			.insert(User)
			.values({
				id: adminId,
				email: adminEmail,
				username: "payments_admin",
				registrationDate: new Date(),
			})
			.onConflictDoNothing()

		await withSupabaseAuthStub(
			{
				[token]: { id: ownerId, email: ownerEmail },
				[adminToken]: { id: adminId, email: adminEmail },
			},
			async () => {
				const submitBody = new FormData()
				submitBody.set("method", "bank_transfer")
				submitBody.set("currency", "USD")
				submitBody.set("accountHolderName", "Pagos Config S.R.L.")
				submitBody.set("bankName", "Banco Nacional")
				submitBody.set("country", "BO")
				submitBody.set("accountIdentifier", "123456789012")
				submitBody.set("payoutSchedule", "weekly")
				submitBody.set("submissionNotes", "Cuenta principal")

				const submitRes = await paymentAccountsPost({
					request: makeAuthedRequest("/api/provider/settings/payment-accounts", token, submitBody),
				} as any)
				expect(submitRes.status).toBe(201)
				const submitted = await submitRes.json()
				expect(submitted.account.status).toBe("pending")
				expect(submitted.account.accountNumberLast4).toBe("9012")
				expect(submitted.account.accountReference).toBe("••••9012")
				expect(submitted.account.accountIdentifier).toBeNull()

				const listRes = await paymentAccountsGet({
					request: makeAuthedRequest("/api/provider/settings/payment-accounts", token),
				} as any)
				expect(listRes.status).toBe(200)
				const listed = await listRes.json()
				expect(listed.counts.pending).toBe(1)
				expect(listed.permissions.canManagePayments).toBe(true)

				const selfReviewBody = new FormData()
				selfReviewBody.set("action", "review")
				selfReviewBody.set("id", submitted.account.id)
				selfReviewBody.set("status", "verified")
				const selfReviewRes = await paymentAccountsPost({
					request: makeAuthedRequest(
						"/api/provider/settings/payment-accounts",
						token,
						selfReviewBody
					),
				} as any)
				expect(selfReviewRes.status).toBe(403)

				await elevateInternalTestSession({ userId: adminId, accessToken: adminToken })
				const adminRes = await adminPaymentAccountsPost({
					request: makeAuthedRequest(
						"/api/admin/providers/payment-accounts",
						adminToken,
						JSON.stringify({
							providerId,
							accountId: submitted.account.id,
							status: "verified",
							reason: "Constancia bancaria y titularidad corroboradas por el equipo.",
						})
					),
				} as any)
				expect(adminRes.status).toBe(200)
				const reviewed = await adminRes.json()
				expect(reviewed.account.status).toBe("verified")

				const persisted = await db
					.select({
						status: ProviderPaymentAccount.status,
						accountNumberLast4: ProviderPaymentAccount.accountNumberLast4,
						verifiedAt: ProviderPaymentAccount.verifiedAt,
					})
					.from(ProviderPaymentAccount)
					.where(eq(ProviderPaymentAccount.id, submitted.account.id))
					.then((rows) => rows[0])
				expect(persisted?.status).toBe("verified")
				expect(persisted?.accountNumberLast4).toBe("9012")
				expect(persisted?.verifiedAt).toBeTruthy()

				const rawAccount = await db
					.select({ metadataJson: ProviderPaymentAccount.metadataJson })
					.from(ProviderPaymentAccount)
					.where(eq(ProviderPaymentAccount.id, submitted.account.id))
					.then((rows) => rows[0])
				const meta = (rawAccount?.metadataJson ?? {}) as Record<string, unknown>
				expect(meta.accountIdentifier).toBeUndefined()
				expect(meta.accountIdentifierEnc).toBeTruthy()

				const financial = await db
					.select()
					.from(ProviderFinancialProfile)
					.where(eq(ProviderFinancialProfile.providerId, providerId))
					.then((rows) => rows[0])
				expect(financial).toMatchObject({
					status: "incomplete",
					currency: "USD",
					payoutSchedule: "weekly",
					payoutMethodReference: submitted.account.id,
				})

				const audit = await db
					.select({ action: ProviderAuditLog.action })
					.from(ProviderAuditLog)
					.where(eq(ProviderAuditLog.providerId, providerId))

				expect(audit.some((row) => row.action === "provider.payment_account.create")).toBe(true)
				expect(audit.some((row) => row.action === "provider.payment_account.review")).toBe(true)
			},
			{ adminEmails: adminEmail }
		)
	})

	it("rejects payment management for staff without payment permission", async () => {
		const providerId = `provider_payments_staff_${crypto.randomUUID()}`
		const token = "t_payments_staff"
		const staffEmail = "payments.staff@example.com"
		const staffId = `user_${staffEmail}`
		const now = new Date()

		await upsertProvider({
			id: providerId,
			legalName: "Staff Payments S.R.L.",
			displayName: "Staff Payments",
			ownerEmail: "payments.owner.staffcase@example.com",
		})
		await db
			.insert(User)
			.values({
				id: staffId,
				email: staffEmail,
				username: "payments_staff",
				registrationDate: now,
			})
			.onConflictDoNothing()
		await db
			.insert(ProviderUser)
			.values({
				id: `provider_user_${staffId}`,
				providerId,
				userId: staffId,
				role: "staff",
				createdAt: now,
			})
			.onConflictDoNothing()

		await withSupabaseAuthStub({ [token]: { id: staffId, email: staffEmail } }, async () => {
			const body = new FormData()
			body.set("accountHolderName", "Staff")
			body.set("bankName", "Bank")
			body.set("country", "CL")
			body.set("currency", "CLP")
			body.set("accountIdentifier", "99887766")

			const res = await paymentAccountsPost({
				request: makeAuthedRequest("/api/provider/settings/payment-accounts", token, body),
			} as any)
			expect(res.status).toBe(403)
			const payload = await res.json()
			expect(payload.error).toBe("forbidden")
		})
	})

	it("requires reason when admin marks a payout account as requires_attention", async () => {
		const providerId = `provider_payments_attention_${crypto.randomUUID()}`
		const token = "t_payments_attention"
		const ownerEmail = `payments.attention.${crypto.randomUUID()}@example.com`
		const ownerId = `user_${ownerEmail}`
		const adminToken = "t_payments_attention_admin"
		const adminEmail = "payments.attention.admin@fastt.test"
		const adminId = `user_${adminEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Attention Payments S.R.L.",
			displayName: "Attention Payments",
			ownerEmail,
		})
		await db
			.insert(User)
			.values({
				id: adminId,
				email: adminEmail,
				username: "payments_attention_admin",
				registrationDate: new Date(),
			})
			.onConflictDoNothing()

		await withSupabaseAuthStub(
			{
				[token]: { id: ownerId, email: ownerEmail },
				[adminToken]: { id: adminId, email: adminEmail },
			},
			async () => {
				const submitBody = new FormData()
				submitBody.set("accountHolderName", "Attention Payments")
				submitBody.set("bankName", "Banco Sur")
				submitBody.set("country", "AR")
				submitBody.set("currency", "USD")
				submitBody.set("accountIdentifier", "5566778899")

				const submitRes = await paymentAccountsPost({
					request: makeAuthedRequest("/api/provider/settings/payment-accounts", token, submitBody),
				} as any)
				const submitted = await submitRes.json()

				await elevateInternalTestSession({ userId: adminId, accessToken: adminToken })
				const attentionRes = await adminPaymentAccountsPost({
					request: makeAuthedRequest(
						"/api/admin/providers/payment-accounts",
						adminToken,
						JSON.stringify({
							providerId,
							accountId: submitted.account.id,
							status: "requires_attention",
						})
					),
				} as any)
				expect(attentionRes.status).toBe(400)
				const payload = await attentionRes.json()
				expect(payload.error).toBe("reason_required")
			},
			{ adminEmails: adminEmail }
		)
	})
})
