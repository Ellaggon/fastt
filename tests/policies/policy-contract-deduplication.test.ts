import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const migration = readFileSync(
	join(process.cwd(), "db/migrations/2026-07-05_policy_contract_deduplication.sql"),
	"utf8"
)

let client: Client

beforeEach(async () => {
	client = createClient({ url: ":memory:" })
	await client.executeMultiple(`
		CREATE TABLE PolicyGroup (
			id TEXT PRIMARY KEY,
			category TEXT NOT NULL,
			ownerProviderId TEXT NOT NULL
		);
		CREATE TABLE Policy (
			id TEXT PRIMARY KEY,
			groupId TEXT NOT NULL,
			description TEXT NOT NULL,
			version INTEGER NOT NULL,
			status TEXT NOT NULL,
			policyPresetKey TEXT,
			stayLengthType TEXT,
			gracePeriod INTEGER,
			refundBasis TEXT,
			payoutBasis TEXT,
			localTimezone TEXT
		);
		CREATE TABLE PolicyAssignment (
			id TEXT PRIMARY KEY,
			policyGroupId TEXT NOT NULL,
			isActive INTEGER NOT NULL
		);
		CREATE TABLE PolicyRule (
			id TEXT PRIMARY KEY,
			policyId TEXT NOT NULL,
			ruleKey TEXT,
			ruleValue TEXT
		);
		CREATE TABLE CancellationTier (
			id TEXT PRIMARY KEY,
			policyId TEXT NOT NULL,
			daysBeforeArrival INTEGER NOT NULL,
			penaltyType TEXT NOT NULL,
			penaltyAmount REAL
		);
		CREATE TABLE PolicyAuditLog (
			id TEXT PRIMARY KEY,
			eventType TEXT,
			policyId TEXT,
			policyGroupId TEXT,
			beforeJson TEXT,
			afterJson TEXT,
			createdAt INTEGER
		);
		CREATE TABLE BookingPolicySnapshot (
			id TEXT PRIMARY KEY,
			policyId TEXT
		);
		CREATE TABLE PolicyExceptionRule (
			id TEXT PRIMARY KEY,
			scope TEXT,
			scopeId TEXT
		);

		INSERT INTO PolicyGroup VALUES
			('group-unused', 'Cancellation', 'provider-1'),
			('group-assigned', 'Cancellation', 'provider-1');
		INSERT INTO Policy VALUES
			(
				'policy-unused', 'group-unused', 'No reembolsable', 1, 'active',
				'non_refundable', 'any', 0, 'none', 'gross', 'property_local'
			),
			(
				'policy-assigned', 'group-assigned', 'No reembolsable', 1, 'active',
				'non_refundable', 'any', 0, 'none', 'gross', 'property_local'
			);
		INSERT INTO PolicyAssignment VALUES ('assignment-1', 'group-assigned', 1);
		INSERT INTO PolicyRule VALUES
			('rule-duplicate-1', 'policy-unused', 'refundTiers', '[]'),
			('rule-duplicate-2', 'policy-assigned', 'refundBasis', '"none"');
		INSERT INTO CancellationTier VALUES
			('tier-unused', 'policy-unused', 0, 'percentage', 100),
			('tier-assigned', 'policy-assigned', 0, 'percentage', 100);
		INSERT INTO BookingPolicySnapshot VALUES ('snapshot-1', 'policy-unused');
	`)
})

afterEach(() => {
	client.close()
})

describe("policy contract deduplication migration", () => {
	it("keeps the assigned preset group and removes duplicate contract sources", async () => {
		await client.executeMultiple(migration)

		const groups = await client.execute("SELECT id FROM PolicyGroup ORDER BY id")
		expect(groups.rows).toEqual([{ id: "group-assigned" }])

		const policies = await client.execute("SELECT id FROM Policy ORDER BY id")
		expect(policies.rows).toEqual([{ id: "policy-assigned" }])

		const assignment = await client.execute(
			"SELECT policyGroupId FROM PolicyAssignment WHERE id = 'assignment-1'"
		)
		expect(assignment.rows[0]?.policyGroupId).toBe("group-assigned")

		const snapshot = await client.execute(
			"SELECT policyId FROM BookingPolicySnapshot WHERE id = 'snapshot-1'"
		)
		expect(snapshot.rows[0]?.policyId).toBe("policy-assigned")

		const forbiddenRules = await client.execute(`
			SELECT COUNT(*) AS total
			FROM PolicyRule
			WHERE ruleKey IN (
				'cancellationPreset',
				'stayLengthType',
				'freeCancellationUntilDaysBeforeArrival',
				'gracePeriodHoursAfterBooking',
				'refundBasis',
				'hostPayoutBasis',
				'refundTiers'
			)
		`)
		expect(Number(forbiddenRules.rows[0]?.total)).toBe(0)

		const canonicalRules = await client.execute(`
			SELECT ruleKey
			FROM PolicyRule
			WHERE policyId = 'policy-assigned'
			ORDER BY ruleKey
		`)
		expect(canonicalRules.rows.map((row) => row.ruleKey)).toEqual([
			"stayLengthThresholdNights",
			"taxRefundProration",
			"taxesFeesBasis",
		])

		await expect(
			client.execute(`
				INSERT INTO PolicyRule (id, policyId, ruleKey, ruleValue)
				VALUES ('forbidden', 'policy-assigned', 'refundTiers', '[]')
			`)
		).rejects.toThrow("POLICY_RULE_DUPLICATES_CANONICAL_CONTRACT_SOURCE")
	})
})
