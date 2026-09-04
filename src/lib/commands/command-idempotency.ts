import { createHash } from "node:crypto"

import {
	and,
	asc,
	CommandIdempotency,
	db,
	eq,
	inArray,
	lt,
	or,
} from "@/shared/infrastructure/db/compat"

export class IdempotencyConflictError extends Error {
	readonly code = "idempotency_key_reused_with_different_payload"

	constructor() {
		super("An idempotency key cannot be reused with a different command payload.")
	}
}

export type IdempotencyReservation<T = unknown> =
	| { kind: "execute"; id: string }
	| { kind: "replay"; response: T | null }
	| { kind: "in_progress" }

export class IdempotencyKeyError extends Error {
	readonly code = "idempotency_key_invalid"
	readonly status = 400

	constructor(message = "idempotency_key_invalid") {
		super(message)
	}
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize)
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)])
		)
	}
	return value
}

export function commandPayloadHash(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(value)))
		.digest("hex")
}

export function normalizeCommandIdempotencyKey(value: string): string {
	const key = value.trim()
	if (!key || key.length > 200) throw new IdempotencyKeyError()
	return key
}

export function idempotencyKeyFromRequest(request: Request): string {
	const key = request.headers.get("idempotency-key")
	if (!key) throw new IdempotencyKeyError("idempotency_key_required")
	return normalizeCommandIdempotencyKey(key)
}

export async function reserveCommandIdempotency<T = unknown>(params: {
	scope: string
	key: string
	payload: unknown
	requestId: string
	actorUserId?: string | null
	ttlMs?: number
}): Promise<IdempotencyReservation<T>> {
	const scope = String(params.scope ?? "").trim()
	if (!scope || scope.length > 160) throw new Error("idempotency_scope_invalid")
	const key = normalizeCommandIdempotencyKey(params.key)
	const requestHash = commandPayloadHash(params.payload)
	const now = new Date()

	const existing = await db
		.select({
			id: CommandIdempotency.id,
			requestHash: CommandIdempotency.requestHash,
			status: CommandIdempotency.status,
			responseJson: CommandIdempotency.responseJson,
		})
		.from(CommandIdempotency)
		.where(and(eq(CommandIdempotency.scope, scope), eq(CommandIdempotency.key, key)))
		.then((rows) => rows[0])

	if (existing) {
		if (existing.requestHash !== requestHash) throw new IdempotencyConflictError()
		if (existing.status === "succeeded")
			return { kind: "replay", response: existing.responseJson as T | null }

		// Failed commands and stale leases may be retried with exactly the same
		// command payload. The conditional update prevents two retries from
		// acquiring the same reservation simultaneously.
		const reclaimed = await db
			.update(CommandIdempotency)
			.set({
				status: "started",
				responseJson: null,
				actorUserId: params.actorUserId ?? undefined,
				requestId: params.requestId,
				expiresAt: new Date(Date.now() + (params.ttlMs ?? 24 * 60 * 60 * 1000)),
				updatedAt: now,
			})
			.where(
				and(
					eq(CommandIdempotency.id, existing.id),
					or(eq(CommandIdempotency.status, "failed"), lt(CommandIdempotency.expiresAt, now))
				)
			)
			.returning({ id: CommandIdempotency.id })
		if (reclaimed[0]) return { kind: "execute", id: existing.id }
		return reserveCommandIdempotency<T>(params)
	}

	const id = crypto.randomUUID()
	try {
		await db.insert(CommandIdempotency).values({
			id,
			scope,
			key,
			requestHash,
			status: "started",
			actorUserId: params.actorUserId ?? undefined,
			requestId: params.requestId,
			expiresAt: new Date(Date.now() + (params.ttlMs ?? 24 * 60 * 60 * 1000)),
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		return { kind: "execute", id }
	} catch (error) {
		// A concurrent request won the unique key race. Resolve it using the same
		// rules rather than executing the command a second time.
		const message = error instanceof Error ? error.message : String(error)
		if (!message.toLowerCase().includes("unique")) throw error
		return reserveCommandIdempotency<T>(params)
	}
}

export async function completeCommandIdempotency(params: {
	id: string
	response: unknown
}): Promise<void> {
	await db
		.update(CommandIdempotency)
		.set({ status: "succeeded", responseJson: params.response, updatedAt: new Date() })
		.where(eq(CommandIdempotency.id, params.id))
}

export async function failCommandIdempotency(params: { id: string }): Promise<void> {
	await db
		.update(CommandIdempotency)
		.set({ status: "failed", updatedAt: new Date() })
		.where(eq(CommandIdempotency.id, params.id))
}

/**
 * Removes only completed, expired records. Started reservations are retained so
 * a same-payload retry can reclaim them safely instead of permitting a second
 * command with a different payload after a lease expires.
 */
export async function cleanupExpiredCommandIdempotency(params?: {
	now?: Date
	limit?: number
}): Promise<number> {
	const now = params?.now ?? new Date()
	const limit = Math.min(Math.max(params?.limit ?? 250, 1), 1_000)
	const rows = await db
		.select({ id: CommandIdempotency.id })
		.from(CommandIdempotency)
		.where(
			and(
				lt(CommandIdempotency.expiresAt, now),
				inArray(CommandIdempotency.status, ["succeeded", "failed"])
			)
		)
		.orderBy(asc(CommandIdempotency.expiresAt))
		.limit(limit)
	if (!rows.length) return 0
	await db.delete(CommandIdempotency).where(
		inArray(
			CommandIdempotency.id,
			rows.map((row) => row.id)
		)
	)
	return rows.length
}
