import { describe, expect, it } from "vitest"
import {
	db,
	eq,
	ProviderAuditLog,
	ProviderProfile,
	ProviderTaxConfiguration,
	User,
} from "astro:db"
import { POST as providerProfilePost } from "@/pages/api/providers/profile"
import {
	GET as taxConfigurationGet,
	POST as taxConfigurationPost,
} from "@/pages/api/provider/settings/tax-configuration"
import { POST as adminTaxConfigurationPost } from "@/pages/api/admin/providers/tax-configuration"
import { GET as settingsSummaryGet } from "@/pages/api/provider/settings/summary"
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

function makeAuthedRequest(path: string, token: string, body?: FormData | string): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	headers.set("accept", "application/json")
	if (!body) return new Request(`http://localhost:4321${path}`, { headers })
	if (typeof body === "string") {
		headers.set("Content-Type", "application/json")
		return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
	}
	return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
}

describe("integration/provider fiscal profile separation", () => {
	it("keeps ops in ProviderProfile, derives pending fiscal status, and requires admin to verify", async () => {
		const providerId = "provider_fiscal_separation"
		const token = "t_fiscal_separation"
		const email = "fiscal.separation@example.com"
		const userId = `user_${email}`
		const adminToken = "t_fiscal_admin"
		const adminEmail = "fiscal.admin@fastt.test"
		const adminId = `user_${adminEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Separacion Fiscal S.R.L.",
			displayName: "Separacion Fiscal",
			ownerEmail: email,
		})
		await db
			.insert(User)
			.values({
				id: adminId,
				email: adminEmail,
				username: "fiscal_admin",
				registrationDate: new Date(),
			})
			.onConflictDoNothing?.()
			.catch(async () => {
				// Some drivers lack onConflictDoNothing on insert builder — ignore duplicate.
			})

		const profileForm = new FormData()
		profileForm.set("timezone", "America/Santiago")
		profileForm.set("defaultCurrency", "USD")
		profileForm.set("supportEmail", "soporte@fiscal.test")
		profileForm.set("supportPhone", "+59170000000")

		await withSupabaseAuthStub(
			{
				[token]: { id: userId, email },
				[adminToken]: { id: adminId, email: adminEmail },
			},
			async () => {
				const profileRes = await providerProfilePost({
					request: makeAuthedRequest("/api/providers/profile", token, profileForm),
				} as any)
				expect(profileRes.status).toBe(200)

				const taxForm = new FormData()
				// Even if the client tries to self-verify, server must derive pending.
				taxForm.set("status", "verified")
				taxForm.set("taxResidenceCountry", "BO")
				taxForm.set("businessRegistrationNumber", "1020304050")
				taxForm.set("taxRegime", "general")
				taxForm.set("invoicingMode", "provider_invoice")

				const taxRes = await taxConfigurationPost({
					request: makeAuthedRequest(
						"/api/provider/settings/tax-configuration",
						token,
						taxForm
					),
				} as any)
				expect(taxRes.status).toBe(200)
				const taxBody = await taxRes.json()
				expect(taxBody.taxConfiguration).toMatchObject({
					status: "pending",
					taxResidenceCountry: "BO",
					businessRegistrationNumber: "1020304050",
					taxRegime: "general",
					invoicingMode: "provider_invoice",
				})

				const getRes = await taxConfigurationGet({
					request: makeAuthedRequest("/api/provider/settings/tax-configuration", token),
				} as any)
				expect(getRes.status).toBe(200)
				const getBody = await getRes.json()
				expect(getBody.taxConfiguration.status).toBe("pending")
				expect(getBody.permissions.canManageFiscality).toBe(true)

				const adminRes = await adminTaxConfigurationPost({
					request: makeAuthedRequest(
						"/api/admin/providers/tax-configuration",
						adminToken,
						JSON.stringify({ providerId, status: "verified" })
					),
				} as any)
				expect(adminRes.status).toBe(200)
				const adminBody = await adminRes.json()
				expect(adminBody.taxConfiguration.status).toBe("verified")

				const summaryRes = await settingsSummaryGet({
					request: makeAuthedRequest("/api/provider/settings/summary", token),
				} as any)
				expect(summaryRes.status).toBe(200)
				const summary = await summaryRes.json()
				expect(summary.taxConfiguration).toMatchObject({
					status: "verified",
					taxResidenceCountry: "BO",
					businessRegistrationNumber: "1020304050",
				})
				expect(summary.profile).toMatchObject({
					timezone: "America/Santiago",
					defaultCurrency: "USD",
					supportEmail: "soporte@fiscal.test",
				})
				expect(summary.profile).not.toHaveProperty("fiscalStatus")
				expect(summary.profile).not.toHaveProperty("paymentReadinessStatus")
			},
			{ adminEmails: adminEmail }
		)

		const profile = await db
			.select()
			.from(ProviderProfile)
			.where(eq(ProviderProfile.providerId, providerId))
			.get()
		expect(profile).toMatchObject({
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: "soporte@fiscal.test",
			supportPhone: "+59170000000",
		})
		expect(profile).not.toHaveProperty("taxResidenceCountry")
		expect(profile).not.toHaveProperty("fiscalStatus")

		const taxConfiguration = await db
			.select()
			.from(ProviderTaxConfiguration)
			.where(eq(ProviderTaxConfiguration.providerId, providerId))
			.get()
		expect(taxConfiguration).toMatchObject({
			status: "verified",
			taxResidenceCountry: "BO",
			businessRegistrationNumber: "1020304050",
			taxRegime: "general",
			invoicingMode: "provider_invoice",
			updatedBy: adminId,
		})

		const audit = await db
			.select({
				action: ProviderAuditLog.action,
				beforeJson: ProviderAuditLog.beforeJson,
				afterJson: ProviderAuditLog.afterJson,
			})
			.from(ProviderAuditLog)
			.where(eq(ProviderAuditLog.providerId, providerId))
			.all()
		expect(audit.some((row) => row.action === "provider.tax_configuration.upsert")).toBe(true)
		expect(audit.some((row) => row.action === "provider.tax_configuration.review")).toBe(true)
		const taxAudit = audit.find((row) => row.action === "provider.tax_configuration.upsert")
		expect(taxAudit?.afterJson).toMatchObject({
			status: "pending",
			taxResidenceCountry: "BO",
		})
	})
})
