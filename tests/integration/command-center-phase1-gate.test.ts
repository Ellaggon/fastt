import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
	assertSeparationOfDuties,
	requireInternalPermission,
} from "@/lib/auth/internal-authorization"
import { commandPayloadHash, reserveCommandIdempotency } from "@/lib/commands/command-idempotency"
import { elevateInternalTestSession } from "../test-support/internal-mfa"
import { POST as policyExceptionsPost } from "@/pages/api/admin/policies/exceptions"
import { PATCH as policyExceptionsPatch } from "@/pages/api/admin/policies/exceptions/[id]"
import { GET as complianceGet } from "@/pages/api/admin/providers/compliance"
import { POST as verificationPost } from "@/pages/api/admin/providers/verification"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import {
	db,
	eq,
	inArray,
	AuditEvent,
	CommandIdempotency,
	InternalRole,
	InternalSecuritySession,
	InternalUserRole,
	Provider,
	ProviderAuditLog,
	ProviderConfigurationState,
	ProviderVerification,
	User,
} from "@/shared/infrastructure/db/compat"

type TestUser = { id: string; email: string; token: string }

const suffix = crypto.randomUUID()
const providerId = `phase1_gate_provider_${suffix}`
const users = {
	auditor: {
		id: `phase1_gate_auditor_${suffix}`,
		email: `phase1-gate-auditor-${suffix}@fastt.test`,
		token: `phase1-gate-auditor-token-${suffix}`,
	},
	fiscal: {
		id: `phase1_gate_fiscal_${suffix}`,
		email: `phase1-gate-fiscal-${suffix}@fastt.test`,
		token: `phase1-gate-fiscal-token-${suffix}`,
	},
	verification: {
		id: `phase1_gate_verification_${suffix}`,
		email: `phase1-gate-verification-${suffix}@fastt.test`,
		token: `phase1-gate-verification-token-${suffix}`,
	},
	legacyOnly: {
		id: `phase1_gate_legacy_${suffix}`,
		email: `phase1-gate-legacy-${suffix}@fastt.test`,
		token: `phase1-gate-legacy-token-${suffix}`,
	},
} satisfies Record<string, TestUser>

const userByToken = Object.fromEntries(Object.values(users).map((user) => [user.token, user]))
const requestIds: string[] = []
const idempotencyKeys: string[] = []

const previous = {
	fetch: globalThis.fetch,
	supabaseUrl: process.env.SUPABASE_URL,
	supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
	allowlist: process.env.INTERNAL_ADMIN_EMAILS,
	fallback: process.env.FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK,
}

function makeRequest(params: {
	path: string
	user: TestUser
	method?: "GET" | "POST" | "PATCH"
	body?: Record<string, unknown>
	idempotencyKey?: string
	requestId?: string
}) {
	const headers = new Headers({
		cookie: `sb-access-token=${encodeURIComponent(params.user.token)}; sb-refresh-token=r`,
		accept: "application/json",
	})
	if (params.body) headers.set("content-type", "application/json")
	if (params.idempotencyKey) headers.set("idempotency-key", params.idempotencyKey)
	if (params.requestId) headers.set("x-request-id", params.requestId)
	return new Request(`http://localhost:4321${params.path}`, {
		method: params.method ?? (params.body ? "POST" : "GET"),
		headers,
		body: params.body ? JSON.stringify(params.body) : undefined,
	})
}

function trackRequestId(): string {
	const requestId = `gate-${crypto.randomUUID()}`
	requestIds.push(requestId)
	return requestId
}

function trackIdempotencyKey(): string {
	const key = `gate-command-${crypto.randomUUID()}`
	idempotencyKeys.push(key)
	return key
}

async function assignRole(user: TestUser, roleKey: string) {
	const role = await db
		.select({ id: InternalRole.id })
		.from(InternalRole)
		.where(eq(InternalRole.key, roleKey))
		.then((rows) => rows[0])
	expect(role?.id).toBeTruthy()
	await db.insert(InternalUserRole).values({
		id: crypto.randomUUID(),
		userId: user.id,
		roleId: role!.id,
		scopeType: "global",
		status: "active",
		createdAt: new Date(),
		updatedAt: new Date(),
	})
}

async function auditOutcomes(requestId: string): Promise<string[]> {
	return db
		.select({ outcome: AuditEvent.outcome })
		.from(AuditEvent)
		.where(eq(AuditEvent.requestId, requestId))
		.then((rows) => rows.map((row) => row.outcome))
}

describe.sequential("command-center phase 1 role and command gate", () => {
	beforeAll(async () => {
		process.env.SUPABASE_URL = "https://supabase.test"
		process.env.SUPABASE_ANON_KEY = "sb_publishable_test"
		process.env.INTERNAL_ADMIN_EMAILS = users.legacyOnly.email
		process.env.FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK = "false"
		globalThis.fetch = (async (input: string | Request, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.url
			if (url !== "https://supabase.test/auth/v1/user") {
				return new Response("unexpected_fetch", { status: 500 })
			}
			const headers = init?.headers
			const authorization =
				typeof (headers as Headers | undefined)?.get === "function"
					? (headers as Headers).get("authorization")
					: (headers as Record<string, string> | undefined)?.Authorization
			const token = String(authorization ?? "")
				.replace(/^Bearer\s+/i, "")
				.trim()
			const user = userByToken[token]
			if (!user) return new Response("Unauthorized", { status: 401 })
			return new Response(JSON.stringify({ id: user.id, email: user.email }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}) as typeof fetch

		await db
			.insert(User)
			.values(Object.values(users).map((user) => ({ id: user.id, email: user.email })))
		await Promise.all([
			assignRole(users.auditor, "auditor"),
			assignRole(users.fiscal, "fiscal_reviewer"),
			assignRole(users.verification, "verification_reviewer"),
		])
		await upsertProvider({
			id: providerId,
			legalName: "Phase 1 gate provider",
			displayName: "Phase 1 gate provider",
		})
	})

	afterAll(async () => {
		globalThis.fetch = previous.fetch
		if (previous.supabaseUrl === undefined) delete process.env.SUPABASE_URL
		else process.env.SUPABASE_URL = previous.supabaseUrl
		if (previous.supabaseAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY
		else process.env.SUPABASE_ANON_KEY = previous.supabaseAnonKey
		if (previous.allowlist === undefined) delete process.env.INTERNAL_ADMIN_EMAILS
		else process.env.INTERNAL_ADMIN_EMAILS = previous.allowlist
		if (previous.fallback === undefined) delete process.env.FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK
		else process.env.FASTT_INTERNAL_AUTH_ALLOWLIST_FALLBACK = previous.fallback

		await db.delete(AuditEvent).where(eq(AuditEvent.providerId, providerId))
		await db.delete(ProviderAuditLog).where(eq(ProviderAuditLog.providerId, providerId))
		if (idempotencyKeys.length) {
			await db.delete(CommandIdempotency).where(inArray(CommandIdempotency.key, idempotencyKeys))
		}
		await db.delete(InternalSecuritySession).where(
			inArray(
				InternalSecuritySession.userId,
				Object.values(users).map((user) => user.id)
			)
		)
		await db.delete(InternalUserRole).where(
			inArray(
				InternalUserRole.userId,
				Object.values(users).map((user) => user.id)
			)
		)
		await db.delete(ProviderVerification).where(eq(ProviderVerification.providerId, providerId))
		await db
			.delete(ProviderConfigurationState)
			.where(eq(ProviderConfigurationState.providerId, providerId))
		await db.delete(Provider).where(eq(Provider.id, providerId))
		await db.delete(User).where(
			inArray(
				User.id,
				Object.values(users).map((user) => user.id)
			)
		)
	})

	it("denies policy POST and PATCH to the seeded auditor role", async () => {
		const post = await policyExceptionsPost({
			request: makeRequest({
				path: "/api/admin/policies/exceptions",
				user: users.auditor,
				body: {},
			}),
		} as any)
		expect(post.status).toBe(403)

		const patch = await policyExceptionsPatch({
			request: makeRequest({
				path: "/api/admin/policies/exceptions/rule-1",
				user: users.auditor,
				method: "PATCH",
				body: { operation: "reject", reason: "No authority to reject this rule" },
			}),
			params: { id: "rule-1" },
		} as any)
		expect(patch.status).toBe(403)
	})

	it("denies payout.release to the seeded fiscal reviewer role", async () => {
		await expect(
			requireInternalPermission(
				makeRequest({
					path: "/api/admin/payouts/release",
					user: users.fiscal,
					method: "POST",
					body: {},
				}),
				"payout.release"
			)
		).rejects.toMatchObject({ status: 403 })
	})

	it("rejects a maker acting as their own checker", () => {
		expect(() =>
			assertSeparationOfDuties({
				makerUserId: users.verification.id,
				checkerUserId: users.verification.id,
			})
		).toThrow("maker_checker_separation_required")
	})

	it("denies a sensitive command without recent MFA and audits the attempt", async () => {
		const requestId = trackRequestId()
		const response = await verificationPost({
			request: makeRequest({
				path: "/api/admin/providers/verification",
				user: users.verification,
				body: { providerId, status: "approved" },
				idempotencyKey: trackIdempotencyKey(),
				requestId,
			}),
		} as any)
		expect(response.status).toBe(401)
		expect(await auditOutcomes(requestId)).toEqual(["attempted", "denied"])
	})

	it("replays the same command key and payload without a second case decision", async () => {
		await elevateInternalTestSession({
			userId: users.verification.id,
			accessToken: users.verification.token,
		})
		const key = trackIdempotencyKey()
		const body = { providerId, status: "approved" }
		const first = await verificationPost({
			request: makeRequest({
				path: "/api/admin/providers/verification",
				user: users.verification,
				body,
				idempotencyKey: key,
				requestId: trackRequestId(),
			}),
		} as any)
		const second = await verificationPost({
			request: makeRequest({
				path: "/api/admin/providers/verification",
				user: users.verification,
				body,
				idempotencyKey: key,
				requestId: trackRequestId(),
			}),
		} as any)

		expect(first.status).toBe(200)
		expect(second.status).toBe(200)
		expect(await first.json()).toEqual({ providerId, idempotent: false })
		expect(await second.json()).toEqual({ providerId, idempotent: true })
		const decisions = await db
			.select({ id: ProviderVerification.id })
			.from(ProviderVerification)
			.where(eq(ProviderVerification.providerId, providerId))
		expect(decisions).toHaveLength(1)
	})

	it("rejects a reused key with a different payload and audits the failed attempt", async () => {
		const key = trackIdempotencyKey()
		const initialRequestId = trackRequestId()
		const first = await verificationPost({
			request: makeRequest({
				path: "/api/admin/providers/verification",
				user: users.verification,
				body: { providerId, status: "approved" },
				idempotencyKey: key,
				requestId: initialRequestId,
			}),
		} as any)
		expect(first.status).toBe(200)

		const conflictRequestId = trackRequestId()
		const conflict = await verificationPost({
			request: makeRequest({
				path: "/api/admin/providers/verification",
				user: users.verification,
				body: {
					providerId,
					status: "rejected",
					reason: "Documented contradiction in submitted evidence",
				},
				idempotencyKey: key,
				requestId: conflictRequestId,
			}),
		} as any)
		expect(conflict.status).toBe(409)
		expect(await conflict.json()).toEqual({
			error: "idempotency_key_reused_with_different_payload",
		})
		expect(await auditOutcomes(conflictRequestId)).toEqual(["attempted", "failed"])
	})

	it("reclaims failed and expired reservations in a controlled manner", async () => {
		const payload = { providerId, status: "approved" }
		const failedKey = trackIdempotencyKey()
		const expiredKey = trackIdempotencyKey()
		const now = new Date()
		await db.insert(CommandIdempotency).values([
			{
				id: crypto.randomUUID(),
				scope: "provider.verification.review",
				key: failedKey,
				requestHash: commandPayloadHash(payload),
				status: "failed",
				actorUserId: users.verification.id,
				requestId: trackRequestId(),
				expiresAt: new Date(now.getTime() + 60_000),
				createdAt: now,
				updatedAt: now,
			},
			{
				id: crypto.randomUUID(),
				scope: "provider.verification.review",
				key: expiredKey,
				requestHash: commandPayloadHash(payload),
				status: "started",
				actorUserId: users.verification.id,
				requestId: trackRequestId(),
				expiresAt: new Date(now.getTime() - 1_000),
				createdAt: now,
				updatedAt: now,
			},
		])

		await expect(
			reserveCommandIdempotency({
				scope: "provider.verification.review",
				key: failedKey,
				payload,
				requestId: trackRequestId(),
				actorUserId: users.verification.id,
			})
		).resolves.toMatchObject({ kind: "execute" })
		await expect(
			reserveCommandIdempotency({
				scope: "provider.verification.review",
				key: expiredKey,
				payload,
				requestId: trackRequestId(),
				actorUserId: users.verification.id,
			})
		).resolves.toMatchObject({ kind: "execute" })
	})

	it("does not grant access solely because a user remains in the legacy allowlist", async () => {
		const response = await complianceGet({
			request: makeRequest({ path: "/api/admin/providers/compliance", user: users.legacyOnly }),
		} as any)
		expect(response.status).toBe(403)
	})
})
