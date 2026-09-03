import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const integrity = readFileSync("src/shared/infrastructure/db/schema/postgres-integrity.sql", "utf8")
const typedIntegrity = readFileSync(
	"src/shared/infrastructure/db/schema/typed-assignment-integrity.sql",
	"utf8"
)
const migration = readFileSync(
	"db/migrations/2026-10-19_harden_typed_assignment_ownership.sql",
	"utf8"
)
const completionMigration = readFileSync(
	"db/migrations/2026-10-25_complete_typed_assignment_integrity.sql",
	"utf8"
)

describe("Guardrail: typed assignment owner integrity", () => {
	it("keeps scopeId as a derived compatibility projection", () => {
		const schema = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")
		for (const table of [
			"TaxFeeAssignment",
			"PolicyAssignment",
			"CommercialRuleApplication",
			"PolicyExceptionRule",
		]) {
			const start = schema.indexOf(`export const ${table} = pgTable(`)
			const end = schema.indexOf("\nexport const ", start + 1)
			const source = schema.slice(start, end < 0 ? undefined : end)
			expect(source).toContain('scopeId: txtOpt("scopeId").generatedAlwaysAs')
			expect(source).toContain("typed_target_check")
		}
	})

	it("enforces target ownership and commercial rule-set lineage in PostgreSQL", () => {
		expect(integrity).not.toContain("fastt_validate_tax_fee_assignment_owner")
		expect(typedIntegrity).toContain("fastt_validate_tax_fee_assignment_owner")
		expect(typedIntegrity).toContain("fastt_validate_policy_assignment_owner")
		expect(typedIntegrity).toContain("fastt_validate_commercial_rule_application_owner")
		expect(typedIntegrity).toContain("FOR SHARE")
		expect(migration).toContain("TYPED_ASSIGNMENT_TAX_FEE_PROVIDER_PRECHECK_FAILED")
		expect(migration).toContain("TYPED_ASSIGNMENT_COMMERCIAL_PROVIDER_PRECHECK_FAILED")
	})

	it("prevents parent ownership changes from invalidating existing assignments", () => {
		expect(typedIntegrity).toContain("PRODUCT_PROVIDER_IDENTITY_IMMUTABLE")
		expect(typedIntegrity).toContain("POLICY_GROUP_PROVIDER_IDENTITY_IMMUTABLE")
		expect(typedIntegrity).toContain("COMMERCIAL_RULE_LINEAGE_IMMUTABLE")
		expect(typedIntegrity).toContain("VARIANT_CROSS_PROVIDER_MOVE_BLOCKED")
		expect(typedIntegrity).toContain("RATE_PLAN_CROSS_PROVIDER_MOVE_BLOCKED")
	})

	it("migrates policy exceptions to typed FKs without retaining writable scopeId", () => {
		expect(completionMigration).toContain("POLICY_EXCEPTION_TYPED_TARGET_PRECHECK_FAILED")
		expect(completionMigration).toContain('DROP COLUMN "scopeId"')
		expect(completionMigration).toContain("GENERATED ALWAYS AS")
		expect(completionMigration).toContain('FOREIGN KEY ("productTargetId")')
	})
})
