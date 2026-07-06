import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const rangeGuardsMigration = readFileSync(
	join(process.cwd(), "db/migrations/2026-07-04_policy_assignment_persistent_guards.sql"),
	"utf8"
)
const dateOnlyMigration = readFileSync(
	join(process.cwd(), "db/migrations/2026-07-05_policy_effective_dates_date_only.sql"),
	"utf8"
)

let client: Client

beforeEach(async () => {
	client = createClient({ url: ":memory:" })
	await client.executeMultiple(`
		CREATE TABLE Policy (
			id TEXT PRIMARY KEY NOT NULL,
			groupId TEXT NOT NULL,
			description TEXT NOT NULL,
			version INTEGER NOT NULL,
			status TEXT NOT NULL,
			effectiveFrom TEXT,
			effectiveTo TEXT
		);
		CREATE TABLE PolicyAssignment (
			id TEXT PRIMARY KEY NOT NULL,
			policyGroupId TEXT NOT NULL,
			category TEXT NOT NULL,
			scope TEXT NOT NULL,
			scopeId TEXT NOT NULL,
			channel TEXT,
			effectiveFrom TEXT,
			effectiveTo TEXT,
			isActive INTEGER NOT NULL DEFAULT 1,
			createdAt INTEGER
		);
	`)
	await client.executeMultiple(rangeGuardsMigration)
})

afterEach(() => {
	client.close()
})

describe("policy effective date persistence", () => {
	it("normalizes parseable legacy timestamps to date-only values", async () => {
		await client.execute(`
			INSERT INTO Policy (
				id, groupId, description, version, status, effectiveFrom, effectiveTo
			) VALUES (
				'policy-legacy', 'group-1', 'Legacy', 1, 'active',
				'2030-01-01T00:00:00.000Z', '2030-01-31T23:59:59.000Z'
			)
		`)
		await client.execute(`
			INSERT INTO PolicyAssignment (
				id, policyGroupId, category, scope, scopeId, channel,
				effectiveFrom, effectiveTo, isActive, createdAt
			) VALUES (
				'assignment-legacy', 'group-1', 'Cancellation', 'rate_plan', 'rate-1', NULL,
				'2030-01-01T00:00:00.000Z', '2030-01-31T23:59:59.000Z', 1, 1
			)
		`)

		await client.executeMultiple(dateOnlyMigration)

		const policy = await client.execute(
			"SELECT effectiveFrom, effectiveTo FROM Policy WHERE id = 'policy-legacy'"
		)
		expect(policy.rows[0]).toMatchObject({
			effectiveFrom: "2030-01-01",
			effectiveTo: "2030-01-31",
		})

		const assignment = await client.execute(
			"SELECT effectiveFrom, effectiveTo FROM PolicyAssignment WHERE id = 'assignment-legacy'"
		)
		expect(assignment.rows[0]).toMatchObject({
			effectiveFrom: "2030-01-01",
			effectiveTo: "2030-01-31",
		})
	})

	it("rejects timestamps and impossible dates for Policy", async () => {
		await client.executeMultiple(dateOnlyMigration)

		await expect(
			client.execute(`
				INSERT INTO Policy (
					id, groupId, description, version, status, effectiveFrom, effectiveTo
				) VALUES (
					'policy-timestamp', 'group-1', 'Timestamp', 1, 'active',
					'2030-01-01T00:00:00.000Z', NULL
				)
			`)
		).rejects.toThrow("POLICY_INVALID_EFFECTIVE_DATE_RANGE")

		await expect(
			client.execute(`
				INSERT INTO Policy (
					id, groupId, description, version, status, effectiveFrom, effectiveTo
				) VALUES (
					'policy-invalid', 'group-1', 'Invalid', 1, 'active',
					'2030-02-30', NULL
				)
			`)
		).rejects.toThrow("POLICY_INVALID_EFFECTIVE_DATE_RANGE")
	})

	it("rejects noncanonical PolicyAssignment ranges after convergence", async () => {
		await client.executeMultiple(dateOnlyMigration)

		await expect(
			client.execute(`
				INSERT INTO PolicyAssignment (
					id, policyGroupId, category, scope, scopeId, channel,
					effectiveFrom, effectiveTo, isActive, createdAt
				) VALUES (
					'assignment-timestamp', 'group-1', 'Cancellation', 'rate_plan', 'rate-1', NULL,
					'2030-01-01T00:00:00.000Z', '2030-01-31T23:59:59.000Z', 1, 1
				)
			`)
		).rejects.toThrow("POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE")
	})
})
