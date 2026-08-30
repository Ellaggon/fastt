import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "../..")

describe("CommercialRule write idempotency", () => {
	it("persists a paired command identity behind a provider-scoped partial unique index", async () => {
		const schema = await readFile(
			resolve(root, "src/shared/infrastructure/db/schema/tables.ts"),
			"utf8"
		)
		const migration = await readFile(
			resolve(root, "db/migrations/2026-10-07_commercial_rule_write_idempotency.sql"),
			"utf8"
		)
		const providerInvariantMigration = await readFile(
			resolve(root, "db/migrations/2026-10-08_commercial_rule_idempotency_requires_provider.sql"),
			"utf8"
		)

		expect(schema).toContain('idempotencyKey: txtOpt("idempotencyKey")')
		expect(schema).toContain('idempotencyPayloadHash: txtOpt("idempotencyPayloadHash")')
		expect(schema).toContain('uniqueIndex("CommercialRule_provider_idempotency_unique")')
		expect(schema).toContain("CommercialRule_idempotency_pair_check")
		expect(migration).toContain('WHERE "idempotencyKey" IS NOT NULL')
		expect(migration).toContain("CommercialRule_idempotency_pair_check")
		expect(providerInvariantMigration).toContain('AND "providerId" IS NOT NULL')
	})

	it("makes retry and conflicting key reuse explicit in the write repository", async () => {
		const repository = await readFile(
			resolve(root, "src/lib/commercial-rules/commercialRulesRepository.ts"),
			"utf8"
		)

		expect(repository).toContain("CommercialRuleIdempotencyConflictError")
		expect(repository).toContain('"idempotencyPayloadHash" AS "payloadHash"')
		expect(repository).toContain("if (existing.payloadHash === idempotencyPayloadHash)")
		expect(repository).toContain("isUniqueViolation(error)")
	})
})
