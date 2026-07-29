import "dotenv/config"

import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { claimQueuedProviderSyncJobs } from "@/lib/provider-sync-job-queue"
import { closePostgresClients } from "@/shared/infrastructure/db/client"

const connectionUrl =
	process.env.DIRECT_URL?.trim() ||
	process.env.SUPABASE_DB_URL?.trim() ||
	process.env.DATABASE_URL?.trim() ||
	""
const describePostgres = connectionUrl ? describe : describe.skip
const prefix = `job-claim-${randomUUID()}`
const providers = [`${prefix}-provider-a`, `${prefix}-provider-b`]

describePostgres("provider integration concurrent job claim", () => {
	let sql: postgres.Sql

	async function cleanup() {
		await sql`delete from "ProviderIntegrationSyncJob" where "providerId" in ${sql(providers)}`
		await sql`delete from "Provider" where "id" in ${sql(providers)}`
	}

	beforeAll(async () => {
		sql = postgres(connectionUrl, { max: 2, prepare: false })
		await cleanup()
		await sql`
			insert into "Provider" ("id", "legalName", "displayName", "status", "createdAt")
			values
				(${providers[0]}, 'Claim Provider A', 'Claim Provider A', 'active', now()),
				(${providers[1]}, 'Claim Provider B', 'Claim Provider B', 'active', now())
		`
		for (const [providerIndex, providerId] of providers.entries()) {
			for (let index = 0; index < 8; index += 1) {
				const id = `${prefix}-${providerIndex}-${index}`
				await sql`
					insert into "ProviderIntegrationSyncJob" (
						"id", "providerId", "targetType", "targetId", "connectorKey", "operation",
						"status", "trigger", "priority", "attempts", "maxAttempts", "runAfter",
						"idempotencyKey", "createdAt", "updatedAt"
					)
					values (
						${id}, ${providerId}, 'external_calendar', ${`calendar-${id}`},
						'external_calendars', 'calendar_import', 'queued', 'scheduled', ${index},
						0, 5, now() - interval '1 minute', ${`claim-${id}`}, now(), now()
					)
				`
			}
		}
	})

	afterAll(async () => {
		await cleanup()
		await sql.end()
		await closePostgresClients()
	})

	it("gives concurrent workers disjoint jobs while preserving provider fairness", async () => {
		const now = new Date()
		const [first, second] = await Promise.all([
			claimQueuedProviderSyncJobs({
				now,
				batchSize: 4,
				providerLimit: 2,
				leaseToken: `${prefix}-lease-a`,
				targetType: "external_calendar",
			}),
			claimQueuedProviderSyncJobs({
				now,
				batchSize: 4,
				providerLimit: 2,
				leaseToken: `${prefix}-lease-b`,
				targetType: "external_calendar",
			}),
		])

		expect(first).toHaveLength(4)
		expect(second).toHaveLength(4)
		const firstIds = new Set(first.map((job) => job.id))
		expect(second.some((job) => firstIds.has(job.id))).toBe(false)

		for (const claimed of [first, second]) {
			const counts = new Map<string, number>()
			for (const job of claimed) {
				counts.set(job.providerId, Number(counts.get(job.providerId) ?? 0) + 1)
			}
			expect(Math.max(...counts.values())).toBeLessThanOrEqual(2)
		}
	})
})
