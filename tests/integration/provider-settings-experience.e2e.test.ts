import { describe, expect, it } from "vitest"
import { db, ProviderAuditLog, ProviderProfile, ProviderVerification, TaxFeeDefinition } from "astro:db"
import { GET as settingsSummaryGet } from "@/pages/api/provider/settings/summary"
import { GET as publicationSimulationGet } from "@/pages/api/provider/settings/publication-simulation"
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

function makeAuthedRequest(path: string, token: string): Request {
	const headers = new Headers()
	headers.set("cookie", `sb-access-token=${encodeURIComponent(token)}; sb-refresh-token=r`)
	return new Request(`http://localhost:4321${path}`, { headers })
}

describe("e2e/provider settings mature experience", () => {
	it("exposes blocking matrix, visible audit, role permissions and publication simulation", async () => {
		const providerId = "provider_settings_experience"
		const token = "t_settings_experience"
		const ownerEmail = "settings.experience@example.com"
		const ownerId = `user_${ownerEmail}`
		const now = new Date("2026-07-18T12:00:00.000Z")

		await upsertProvider({
			id: providerId,
			legalName: "Experiencia Madura S.R.L.",
			displayName: "Experiencia Madura",
			ownerEmail,
		})
		await db.insert(ProviderProfile).values({
			providerId,
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: "soporte@experiencia.test",
			taxResidenceCountry: "BO",
			fiscalStatus: "verified",
			paymentReadinessStatus: "not_configured",
			integrationReadinessStatus: "ready",
			governanceUpdatedAt: now,
		})
		await db.insert(ProviderVerification).values({
			id: "verification_settings_experience",
			providerId,
			status: "approved",
			createdAt: now,
		})
		await db.insert(TaxFeeDefinition).values({
			id: "tax_settings_experience",
			providerId,
			code: "IVA",
			name: "IVA",
			kind: "tax",
			calculationType: "percentage",
			value: 13,
			inclusionType: "excluded",
			appliesPer: "stay",
			status: "active",
			createdAt: now,
			updatedAt: now,
		})
		await db.insert(ProviderAuditLog).values({
			id: "audit_settings_experience",
			providerId,
			actorUserId: ownerId,
			action: "provider.profile.upsert",
			entityType: "ProviderProfile",
			entityId: providerId,
			riskLevel: "medium",
			createdAt: now,
		})

		await withSupabaseAuthStub({ [token]: { id: ownerId, email: ownerEmail } }, async () => {
			const summaryRes = await settingsSummaryGet({
				request: makeAuthedRequest("/api/provider/settings/summary", token),
			} as any)
			expect(summaryRes.status).toBe(200)
			const summary = await summaryRes.json()
			expect(summary.blockingMatrix.find((item: any) => item.id === "payments").enabled).toBe(false)
			expect(summary.auditEvents[0].action).toBe("provider.profile.upsert")
			expect(summary.rolePermissions.map((role: any) => role.role)).toEqual([
				"owner",
				"admin",
				"staff",
			])
			expect(summary.publicationSimulation.canPublishSafely).toBe(false)

			const simulationRes = await publicationSimulationGet({
				request: makeAuthedRequest("/api/provider/settings/publication-simulation", token),
			} as any)
			expect(simulationRes.status).toBe(200)
			const simulation = await simulationRes.json()
			expect(simulation.fiscalReady).toBe(true)
			expect(simulation.paymentsReady).toBe(false)
			expect(simulation.blockers.map((blocker: any) => blocker.id)).toContain("payments")
		})
	})
})
