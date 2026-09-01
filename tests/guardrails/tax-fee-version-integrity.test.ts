import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const integrity = readFileSync("src/shared/infrastructure/db/schema/postgres-integrity.sql", "utf8")
const immutableMigration = readFileSync(
	"db/migrations/2026-10-20_harden_tax_fee_version_publication.sql",
	"utf8"
)
const publicationMigration = readFileSync(
	"db/migrations/2026-10-21_require_tax_fee_version_for_published_definition.sql",
	"utf8"
)
const draftDefaultMigration = readFileSync(
	"db/migrations/2026-10-22_default_tax_fee_definitions_to_draft.sql",
	"utf8"
)
const snapshotMigration = readFileSync(
	"db/migrations/2026-10-24_normalize_current_tax_fee_snapshots.sql",
	"utf8"
)
const baseline = readFileSync("db/postgres/0001_initial_schema.sql", "utf8")
const registry = readFileSync("src/shared/infrastructure/db/schema/registry.ts", "utf8")
const schema = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")
const versioning = readFileSync("src/lib/taxes-fees/tax-fee-versioning.ts", "utf8")
const repository = readFileSync(
	"src/modules/taxes-fees/infrastructure/repositories/TaxFeeRepository.ts",
	"utf8"
)
const commercializationCertification = readFileSync(
	"src/scripts/certify-marketplace-commercialization.ts",
	"utf8"
)

describe("Guardrail: tax fee definition version integrity", () => {
	it("keeps the current pointer inside its own definition with a deferred composite FK", () => {
		expect(integrity).toContain('"TaxFeeDefinition_currentVersion_same_definition_fk"')
		expect(integrity).toContain('FOREIGN KEY ("id", "currentVersionId")')
		expect(integrity).toContain('REFERENCES "TaxFeeDefinitionVersion" ("taxFeeDefinitionId", "id")')
		expect(integrity).toContain("DEFERRABLE INITIALLY DEFERRED")
	})

	it("treats released snapshots as append-only evidence", () => {
		expect(integrity).toContain("fastt_prevent_tax_fee_definition_version_mutation")
		expect(integrity).toContain('BEFORE UPDATE OR DELETE ON "TaxFeeDefinitionVersion"')
		expect(immutableMigration).toContain("TAX_FEE_CURRENT_VERSION_PRECHECK_FAILED")
	})

	it("does not allow a commercially published definition without a version", () => {
		expect(integrity).toContain("fastt_validate_tax_fee_definition_publication")
		expect(integrity).toContain("TAX_FEE_PUBLISHED_DEFINITION_REQUIRES_CURRENT_VERSION")
		expect(integrity).toContain('CREATE CONSTRAINT TRIGGER "trg_TaxFeeDefinition_published_version_required"')
		expect(publicationMigration).toContain("TAX_FEE_PUBLISHED_VERSION_PRECHECK_FAILED")
	})

	it("creates definitions as drafts until an explicit publication", () => {
		const start = schema.indexOf("export const TaxFeeDefinition = pgTable(")
		const end = schema.indexOf("export const TaxFeeDefinitionVersion = pgTable(", start)
		const definitionSchema = schema.slice(start, end)
		expect(definitionSchema).toContain('editingState: text("editingState").default("draft").notNull()')
		expect(draftDefaultMigration).toContain(
			'ALTER COLUMN "editingState" SET DEFAULT \'draft\''
		)
	})

	it("includes isolated fiscal drafts in every clean installation", () => {
		expect(registry).toContain('"TaxFeeDefinitionDraft"')
		expect(baseline).toContain('CREATE TABLE "TaxFeeDefinitionDraft"')
		expect(baseline).toContain('"editingState" text NOT NULL DEFAULT \'draft\'')
	})

	it("serializes publication before advancing the current version", () => {
		expect(versioning).toContain('FOR UPDATE')
		expect(versioning).toContain('currentVersionId: id')
		expect(versioning).toContain("expectedCurrentVersionId")
		expect(versioning).toContain("expectedCurrentVersionId: string | null")
		expect(versioning).toContain("expectedRevision: number")
		expect(versioning).toContain("TaxFeeDefinitionPublicationConflictError")
		expect(versioning).toContain("createTaxFeeDefinitionSnapshot")
		expect(repository).toContain("TaxFeeDefinitionVersion.id, TaxFeeDefinitionTable.currentVersionId")
		expect(repository).toContain("parseTaxFeeDefinitionSnapshot")
	})

	it("normalizes legacy snapshots by appending evidence instead of mutating it", () => {
		expect(snapshotMigration).toContain('INSERT INTO "TaxFeeDefinitionVersion"')
		expect(snapshotMigration).toContain("'schemaVersion', 2")
		expect(snapshotMigration).not.toContain('UPDATE "TaxFeeDefinitionVersion"')
	})

	it("routes certification publication through the canonical versioning service", () => {
		expect(commercializationCertification).toContain("publishTaxFeeDefinition")
		expect(commercializationCertification).not.toContain("insert(TaxFeeDefinitionVersion)")
		expect(commercializationCertification).not.toContain("TAX_VERSION_ID")
	})
})
