import { describe, expect, it } from "vitest"
import { db, eq, ProviderInvitation, ProviderUser, User } from "astro:db"
import { POST as invitationsPost } from "@/pages/api/provider/settings/invitations"
import { GET as settingsSummaryGet } from "@/pages/api/provider/settings/summary"
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
	if (!body) return new Request(`http://localhost:4321${path}`, { headers })
	return new Request(`http://localhost:4321${path}`, { method: "POST", headers, body })
}

describe("provider team invitations", () => {
	it("lets an owner create and cancel a pending provider invitation", async () => {
		const providerId = "provider_team_invitations"
		const token = "t_team_invitations"
		const ownerEmail = "team.owner@example.com"
		const ownerId = `user_${ownerEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Equipo Config S.R.L.",
			displayName: "Equipo Config",
			ownerEmail,
		})

		await withSupabaseAuthStub({ [token]: { id: ownerId, email: ownerEmail } }, async () => {
			const createBody = new FormData()
			createBody.set("email", "nueva.persona@example.com")
			createBody.set("role", "admin")

			const createRes = await invitationsPost({
				request: makeAuthedRequest("/api/provider/settings/invitations", token, createBody),
			} as any)
			expect(createRes.status).toBe(201)
			const created = await createRes.json()
			expect(created.status).toBe("pending")

			const summaryRes = await settingsSummaryGet({
				request: makeAuthedRequest("/api/provider/settings/summary", token),
			} as any)
			expect(summaryRes.status).toBe(200)
			const summary = await summaryRes.json()
			expect(summary.invitations).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: created.id,
						email: "nueva.persona@example.com",
						role: "admin",
						status: "pending",
					}),
				])
			)

			const cancelBody = new FormData()
			cancelBody.set("action", "cancel")
			cancelBody.set("id", created.id)
			const cancelRes = await invitationsPost({
				request: makeAuthedRequest("/api/provider/settings/invitations", token, cancelBody),
			} as any)
			expect(cancelRes.status).toBe(200)

			const row = await db
				.select({ status: ProviderInvitation.status })
				.from(ProviderInvitation)
				.where(eq(ProviderInvitation.id, created.id))
				.get()
			expect(row?.status).toBe("canceled")
		})
	})

	it("allows a granular permission override to invite without changing the simple role", async () => {
		const providerId = "provider_team_invitation_override"
		const ownerEmail = "team.override.owner@example.com"
		const staffEmail = "team.override.staff@example.com"
		const staffId = `user_${staffEmail}`
		const token = "t_team_invitation_override"

		await upsertProvider({
			id: providerId,
			legalName: "Equipo Override S.R.L.",
			displayName: "Equipo Override",
			ownerEmail,
		})
		await db.insert(User).values({ id: staffId, email: staffEmail }).onConflictDoNothing()
		await db.insert(ProviderUser).values({
			id: "provider_user_team_invitation_override",
			providerId,
			userId: staffId,
			role: "staff",
			permissionsJson: { canInviteTeam: true },
		})

		await withSupabaseAuthStub({ [token]: { id: staffId, email: staffEmail } }, async () => {
			const body = new FormData()
			body.set("email", "override.invited@example.com")
			body.set("role", "staff")

			const res = await invitationsPost({
				request: makeAuthedRequest("/api/provider/settings/invitations", token, body),
			} as any)

			expect(res.status).toBe(201)
			const created = await res.json()
			expect(created.status).toBe("pending")
		})
	})
})
