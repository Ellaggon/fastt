import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const migration = readFileSync(
	join(process.cwd(), "db/migrations/2026-07-04_policy_assignment_persistent_guards.sql"),
	"utf8"
)

let client: Client

async function insertAssignment(params: {
	id: string
	effectiveFrom?: string | null
	effectiveTo?: string | null
	isActive?: number
	channel?: string | null
}) {
	return client.execute({
		sql: `
			INSERT INTO PolicyAssignment (
				id,
				policyGroupId,
				category,
				scope,
				scopeId,
				channel,
				effectiveFrom,
				effectiveTo,
				isActive,
				createdAt
			) VALUES (?, 'group-1', 'Cancellation', 'rate_plan', 'rate-1', ?, ?, ?, ?, 1)
		`,
		args: [
			params.id,
			params.channel ?? null,
			params.effectiveFrom ?? null,
			params.effectiveTo ?? null,
			params.isActive ?? 1,
		],
	})
}

beforeEach(async () => {
	client = createClient({ url: ":memory:" })
	await client.executeMultiple(`
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
	await client.executeMultiple(migration)
})

afterEach(() => {
	client.close()
})

describe("PolicyAssignment persistent guards", () => {
	it("requires both effective dates or neither date", async () => {
		await expect(
			insertAssignment({
				id: "assignment-one-date",
				effectiveFrom: "2030-01-01",
				effectiveTo: null,
			})
		).rejects.toThrow("POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE")
	})

	it("rejects an effective range whose end precedes its start", async () => {
		await expect(
			insertAssignment({
				id: "assignment-reversed",
				effectiveFrom: "2030-01-10",
				effectiveTo: "2030-01-01",
			})
		).rejects.toThrow("POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE")
	})

	it("allows only one active base assignment per contractual slot", async () => {
		await insertAssignment({ id: "base-one" })
		await expect(insertAssignment({ id: "base-two" })).rejects.toThrow("UNIQUE constraint failed")

		await insertAssignment({ id: "base-inactive", isActive: 0 })
		await expect(
			client.execute({
				sql: "UPDATE PolicyAssignment SET isActive = 1 WHERE id = ?",
				args: ["base-inactive"],
			})
		).rejects.toThrow("UNIQUE constraint failed")
	})

	it("rejects overlapping active exceptions for the same slot", async () => {
		await insertAssignment({
			id: "dated-one",
			effectiveFrom: "2030-01-01",
			effectiveTo: "2030-01-10",
		})
		await expect(
			insertAssignment({
				id: "dated-two",
				effectiveFrom: "2030-01-10",
				effectiveTo: "2030-01-20",
			})
		).rejects.toThrow("POLICY_ASSIGNMENT_ACTIVE_RANGE_OVERLAP")

		await expect(
			insertAssignment({
				id: "dated-other-channel",
				channel: "b2b",
				effectiveFrom: "2030-01-10",
				effectiveTo: "2030-01-20",
			})
		).resolves.toBeDefined()
	})

	it("rejects activating an inactive exception that would overlap", async () => {
		await insertAssignment({
			id: "dated-active",
			effectiveFrom: "2030-02-01",
			effectiveTo: "2030-02-10",
		})
		await insertAssignment({
			id: "dated-inactive",
			effectiveFrom: "2030-02-05",
			effectiveTo: "2030-02-15",
			isActive: 0,
		})

		await expect(
			client.execute({
				sql: "UPDATE PolicyAssignment SET isActive = 1 WHERE id = ?",
				args: ["dated-inactive"],
			})
		).rejects.toThrow("POLICY_ASSIGNMENT_ACTIVE_RANGE_OVERLAP")
	})

	it("rejects making an existing range incomplete through an update", async () => {
		await insertAssignment({
			id: "dated-update",
			effectiveFrom: "2030-03-01",
			effectiveTo: "2030-03-10",
		})

		await expect(
			client.execute({
				sql: "UPDATE PolicyAssignment SET effectiveTo = NULL WHERE id = ?",
				args: ["dated-update"],
			})
		).rejects.toThrow("POLICY_ASSIGNMENT_INVALID_EFFECTIVE_RANGE")
	})
})
