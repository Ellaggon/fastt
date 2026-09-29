import { afterEach, describe, expect, it } from "vitest"

import { listProviderSupport } from "@/lib/provider-support"
import { POST as adminReply } from "@/pages/api/admin/support/[requestId]"
import { POST as providerSubmit } from "@/pages/api/provider/support/index"
import {
	db,
	eq,
	ProviderSupportMessage,
	ProviderSupportRequest,
	User,
} from "@/shared/infrastructure/db/compat"
import { upsertProvider } from "../test-support/catalog-db-test-data"

const original = {
	supabaseUrl: process.env.SUPABASE_URL,
	supabaseKey: process.env.SUPABASE_ANON_KEY,
	adminEmails: process.env.INTERNAL_ADMIN_EMAILS,
	allowlist: process.env.FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK,
	fetch: globalThis.fetch,
}

afterEach(() => {
	globalThis.fetch = original.fetch
	for (const [key, value] of [
		["SUPABASE_URL", original.supabaseUrl],
		["SUPABASE_ANON_KEY", original.supabaseKey],
		["INTERNAL_ADMIN_EMAILS", original.adminEmails],
		["FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK", original.allowlist],
	] as const) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
})

function postRequest(token: string, url: string, entries: Record<string, string>) {
	const form = new FormData()
	for (const [key, value] of Object.entries(entries)) form.set(key, value)
	return new Request(url, {
		method: "POST",
		headers: {
			cookie: `sb-access-token=${encodeURIComponent(token)}`,
			accept: "application/json",
			origin: "http://localhost:4321",
		},
		body: form,
	})
}

describe("provider support channel", () => {
	it("persists an owned thread, rejects cross-provider replies, and lets an authorized agent answer idempotently", async () => {
		const suffix = crypto.randomUUID()
		const providerA = `provider_support_a_${suffix}`
		const providerB = `provider_support_b_${suffix}`
		const emailA = `support-a-${suffix}@example.com`
		const emailB = `support-b-${suffix}@example.com`
		const adminEmail = `support-admin-${suffix}@example.com`
		await upsertProvider({ id: providerA, ownerEmail: emailA })
		await upsertProvider({ id: providerB, ownerEmail: emailB })
		await db.insert(User).values({ id: `user_${adminEmail}`, email: adminEmail })

		process.env.SUPABASE_URL = "https://supabase.test"
		process.env.SUPABASE_ANON_KEY = "sb_publishable_test"
		process.env.INTERNAL_ADMIN_EMAILS = adminEmail
		process.env.FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK = "true"
		const users: Record<string, string> = {
			"provider-a": emailA,
			"provider-b": emailB,
			"admin": adminEmail,
		}
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url =
				typeof input === "string" ? input : String(input instanceof URL ? input : input.url)
			if (url !== "https://supabase.test/auth/v1/user") return new Response(null, { status: 500 })
			const header = new Headers(init?.headers).get("authorization") ?? ""
			const email = users[header.replace(/^Bearer /, "")]
			return email
				? Response.json({ id: `user_${email}`, email })
				: new Response(null, { status: 401 })
		}) as typeof fetch

		const requestKey = crypto.randomUUID()
		const create = () =>
			providerSubmit({
				request: postRequest("provider-a", "http://localhost:4321/api/provider/support", {
					topic: "historical_tour_collection",
					line: "tour",
					body: "Mi cuenta conserva una declaración antigua de cobro por Fastt.",
					requestKey,
				}),
			} as any)
		const first = await create()
		expect(first.status).toBe(201)
		const requestId = String((await first.json()).requestId)
		expect(String((await (await create()).json()).requestId)).toBe(requestId)
		expect((await listProviderSupport(providerA))[0]?.messages).toHaveLength(1)
		const changedRetry = await providerSubmit({
			request: postRequest("provider-a", "http://localhost:4321/api/provider/support", {
				topic: "historical_tour_collection",
				line: "tour",
				body: "Este texto distinto no puede reutilizar la misma clave de envío.",
				requestKey,
			}),
		} as any)
		expect(changedRetry.status).toBe(409)

		const wrongProvider = await providerSubmit({
			request: postRequest("provider-b", "http://localhost:4321/api/provider/support", {
				replyTo: requestId,
				body: "No debo poder responder esta conversación privada.",
				requestKey: crypto.randomUUID(),
			}),
		} as any)
		expect(wrongProvider.status).toBe(404)

		const invalidTourContext = await providerSubmit({
			request: postRequest("provider-a", "http://localhost:4321/api/provider/support", {
				topic: "historical_tour_collection",
				line: "lodging",
				body: "Intento asignar este caso de tour a alojamiento.",
				requestKey: crypto.randomUUID(),
			}),
		} as any)
		expect(invalidTourContext.status).toBe(422)

		const replyUrl = `http://localhost:4321/api/admin/support/${requestId}`
		const denied = await adminReply({
			request: postRequest("provider-b", replyUrl, {
				body: "Esta persona no tiene permiso para gestionar soporte.",
				requestKey: crypto.randomUUID(),
				status: "resolved",
			}),
			params: { requestId },
		} as any)
		expect(denied.status).toBe(403)

		const adminKey = crypto.randomUUID()
		const answer = () =>
			adminReply({
				request: postRequest("admin", replyUrl, {
					body: "Revisaremos la declaración histórica; no se activará ningún cobro por este ticket.",
					requestKey: adminKey,
					status: "waiting_provider",
				}),
				params: { requestId },
			} as any)
		expect((await answer()).status).toBe(200)
		expect((await answer()).status).toBe(200)
		let thread = (await listProviderSupport(providerA))[0]
		expect(thread?.status).toBe("waiting_provider")
		expect(thread?.messages).toHaveLength(2)
		expect(thread?.messages[1]?.authorRole).toBe("internal")

		const followup = await providerSubmit({
			request: postRequest("provider-a", "http://localhost:4321/api/provider/support", {
				replyTo: requestId,
				body: "Adjuntaré los detalles del acuerdo en el canal seguro indicado por Fastt.",
				requestKey: crypto.randomUUID(),
			}),
		} as any)
		expect(followup.status).toBe(200)
		thread = (await listProviderSupport(providerA))[0]
		expect(thread?.status).toBe("open")
		expect(thread?.messages).toHaveLength(3)
		expect((await answer()).status).toBe(200)
		expect((await listProviderSupport(providerA))[0]?.status).toBe("open")

		const resolved = await adminReply({
			request: postRequest("admin", replyUrl, {
				body: "La declaración se revisó. Conservamos el valor histórico sin activar cobros.",
				requestKey: crypto.randomUUID(),
				status: "resolved",
			}),
			params: { requestId },
		} as any)
		expect(resolved.status).toBe(200)
		expect((await listProviderSupport(providerA))[0]?.status).toBe("resolved")
		const reopened = await providerSubmit({
			request: postRequest("provider-a", "http://localhost:4321/api/provider/support", {
				replyTo: requestId,
				body: "Necesito una aclaración adicional sobre la modalidad histórica.",
				requestKey: crypto.randomUUID(),
			}),
		} as any)
		expect(reopened.status).toBe(200)
		expect((await listProviderSupport(providerA))[0]?.status).toBe("open")

		const stored = await db
			.select({ id: ProviderSupportRequest.id })
			.from(ProviderSupportRequest)
			.where(eq(ProviderSupportRequest.id, requestId))
		const messages = await db
			.select({ id: ProviderSupportMessage.id })
			.from(ProviderSupportMessage)
			.where(eq(ProviderSupportMessage.requestId, requestId))
		expect(stored).toHaveLength(1)
		expect(messages).toHaveLength(5)
		expect(await listProviderSupport(providerB)).toEqual([])
	}, 90_000)
})
