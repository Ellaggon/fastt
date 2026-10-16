import { afterEach, describe, expect, it } from "vitest"

import {
	cleanupExpiredCommandIdempotency,
	completeCommandIdempotency,
	failCommandIdempotency,
	commandPayloadHash,
	reserveCommandIdempotency,
} from "@/lib/commands/command-idempotency"
import { CommandIdempotency, db, eq, inArray } from "@/shared/infrastructure/db/compat"

const createdIds: string[] = []

async function insertReservation(params: {
	status: "started" | "succeeded" | "failed"
	expiresAt: Date
	payload: unknown
}) {
	const id = crypto.randomUUID()
	createdIds.push(id)
	const key = `recovery-${crypto.randomUUID()}`
	await db.insert(CommandIdempotency).values({
		id,
		scope: "test.command-idempotency-recovery",
		key,
		requestHash: commandPayloadHash(params.payload),
		status: params.status,
		responseJson: params.status === "succeeded" ? { ok: true } : undefined,
		requestId: `request-${crypto.randomUUID()}`,
		expiresAt: params.expiresAt,
		createdAt: new Date(),
		updatedAt: new Date(),
	})
	return { id, key }
}

afterEach(async () => {
	if (createdIds.length) {
		await db.delete(CommandIdempotency).where(inArray(CommandIdempotency.id, createdIds.splice(0)))
	}
})

describe("command idempotency recovery", () => {
	it("retains a completed result for 24 hours after a short execution lease", async () => {
		const existing = await insertReservation({
			status: "started",
			expiresAt: new Date(Date.now() + 60_000),
			payload: { fixture: true },
		})
		const before = Date.now()
		await completeCommandIdempotency({ id: existing.id, response: { ok: true } })
		const [row] = await db
			.select()
			.from(CommandIdempotency)
			.where(eq(CommandIdempotency.id, existing.id))
		expect(row.status).toBe("succeeded")
		expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000)
	})

	it("returns in_progress promptly for a live lease", async () => {
		const payload = { providerId: "fixture-progress" }
		const existing = await insertReservation({
			status: "started",
			expiresAt: new Date(Date.now() + 60_000),
			payload,
		})
		expect(
			await reserveCommandIdempotency({
				scope: "test.command-idempotency-recovery",
				key: existing.key,
				payload,
				requestId: "concurrent-request",
			})
		).toEqual({ kind: "in_progress" })
	})
	it("never downgrades a committed success after an uncertain response", async () => {
		const existing = await insertReservation({
			status: "succeeded",
			expiresAt: new Date(Date.now() + 60_000),
			payload: { fixture: true },
		})
		await failCommandIdempotency({ id: existing.id })
		const [row] = await db
			.select()
			.from(CommandIdempotency)
			.where(eq(CommandIdempotency.id, existing.id))
		expect(row.status).toBe("succeeded")
		expect(row.responseJson).toEqual({ ok: true })
	})

	it("reclaims a failed reservation only for the same command payload", async () => {
		const payload = { providerId: "provider-1", status: "approved" }
		const existing = await insertReservation({
			status: "failed",
			expiresAt: new Date(Date.now() + 60_000),
			payload,
		})

		const reservation = await reserveCommandIdempotency({
			scope: "test.command-idempotency-recovery",
			key: existing.key,
			payload,
			requestId: "retry-request",
		})
		expect(reservation).toEqual({ kind: "execute", id: existing.id })
	})

	it("reclaims an expired started reservation without allowing a second row", async () => {
		const payload = { providerId: "provider-2", status: "rejected" }
		const existing = await insertReservation({
			status: "started",
			expiresAt: new Date(Date.now() - 1_000),
			payload,
		})

		const reservation = await reserveCommandIdempotency({
			scope: "test.command-idempotency-recovery",
			key: existing.key,
			payload,
			requestId: "retry-request",
		})
		expect(reservation).toEqual({ kind: "execute", id: existing.id })
	})

	it("cleans completed expired records but retains an expired started reservation", async () => {
		const expired = new Date(Date.now() - 1_000)
		const failed = await insertReservation({
			status: "failed",
			expiresAt: expired,
			payload: { id: "failed" },
		})
		const succeeded = await insertReservation({
			status: "succeeded",
			expiresAt: expired,
			payload: { id: "succeeded" },
		})
		const started = await insertReservation({
			status: "started",
			expiresAt: expired,
			payload: { id: "started" },
		})

		expect(
			await cleanupExpiredCommandIdempotency({
				now: new Date(),
				limit: 10,
				scope: "test.command-idempotency-recovery",
			})
		).toBeGreaterThanOrEqual(2)
		const rows = await db
			.select({ id: CommandIdempotency.id })
			.from(CommandIdempotency)
			.where(inArray(CommandIdempotency.id, [failed.id, succeeded.id, started.id]))
		expect(rows).toEqual([{ id: started.id }])
		createdIds.splice(createdIds.indexOf(failed.id), 1)
		createdIds.splice(createdIds.indexOf(succeeded.id), 1)
	})
})
