import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const migration = readFileSync(
	join(process.cwd(), "db/migrations/2026-07-05_policy_final_integrity.sql"),
	"utf8"
)

let client: Client

beforeEach(async () => {
	client = createClient({ url: ":memory:" })
	await client.executeMultiple(`
		CREATE TABLE Provider (
			id TEXT PRIMARY KEY
		);
		CREATE TABLE Product (
			id TEXT PRIMARY KEY,
			providerId TEXT
		);
		CREATE TABLE Variant (
			id TEXT PRIMARY KEY,
			productId TEXT
		);
		CREATE TABLE RatePlan (
			id TEXT PRIMARY KEY,
			variantId TEXT
		);
		CREATE TABLE PolicyGroup (
			id TEXT PRIMARY KEY,
			category TEXT NOT NULL,
			ownerProviderId TEXT
		);
		CREATE TABLE Policy (
			id TEXT PRIMARY KEY,
			groupId TEXT NOT NULL,
			status TEXT NOT NULL,
			legalOverrideFlags TEXT
		);
		CREATE TABLE PolicyAssignment (
			id TEXT PRIMARY KEY,
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

		INSERT INTO Provider VALUES ('provider-1');
		INSERT INTO Product VALUES ('hotel-1', 'provider-1');
		INSERT INTO Variant VALUES ('room-1', 'hotel-1');
		INSERT INTO RatePlan VALUES ('rate-1', 'room-1');
		INSERT INTO PolicyGroup VALUES
			('group-assigned', 'Cancellation', NULL),
			('group-unassigned', 'CheckIn', NULL);
		INSERT INTO Policy VALUES
			('policy-1', 'group-assigned', 'template', '{"legacy":true}');
		INSERT INTO PolicyAssignment (
			id, policyGroupId, category, scope, scopeId, isActive, createdAt
		) VALUES (
			'assignment-1', 'group-assigned', 'Payment', 'rate_plan', 'rate-1', 1, 1
		);
	`)
})

afterEach(() => {
	client.close()
})

describe("policy final integrity migration", () => {
	it("repairs ownership, category and lifecycle while dropping legacy flags", async () => {
		await client.executeMultiple(migration)

		const groups = await client.execute("SELECT id, ownerProviderId FROM PolicyGroup ORDER BY id")
		expect(groups.rows).toEqual([
			{ id: "group-assigned", ownerProviderId: "provider-1" },
			{ id: "group-unassigned", ownerProviderId: "provider-1" },
		])

		const assignment = await client.execute(
			"SELECT category FROM PolicyAssignment WHERE id = 'assignment-1'"
		)
		expect(assignment.rows[0]?.category).toBe("Cancellation")

		const policy = await client.execute("SELECT status FROM Policy WHERE id = 'policy-1'")
		expect(policy.rows[0]?.status).toBe("draft")

		const columns = await client.execute("PRAGMA table_info('Policy')")
		expect(columns.rows.map((row) => row.name)).not.toContain("legalOverrideFlags")
	})

	it("rejects invalid ownership, category divergence and template status", async () => {
		await client.executeMultiple(migration)

		await expect(
			client.execute({
				sql: "INSERT INTO PolicyGroup (id, category, ownerProviderId) VALUES (?, ?, ?)",
				args: ["group-invalid", "Payment", "missing-provider"],
			})
		).rejects.toThrow("POLICY_GROUP_OWNER_REQUIRED")

		await expect(
			client.execute({
				sql: `
					INSERT INTO PolicyAssignment (
						id, policyGroupId, category, scope, scopeId, isActive
					) VALUES (?, ?, ?, ?, ?, 1)
				`,
				args: ["assignment-invalid", "group-assigned", "Payment", "rate_plan", "rate-1"],
			})
		).rejects.toThrow("POLICY_ASSIGNMENT_CATEGORY_MISMATCH")

		await expect(
			client.execute("UPDATE PolicyGroup SET category = 'Payment' WHERE id = 'group-assigned'")
		).rejects.toThrow("POLICY_GROUP_CATEGORY_HAS_ASSIGNMENTS")

		await expect(
			client.execute(
				"INSERT INTO Policy (id, groupId, status) VALUES ('policy-template', 'group-assigned', 'template')"
			)
		).rejects.toThrow("POLICY_INVALID_STATUS")
	})
})
