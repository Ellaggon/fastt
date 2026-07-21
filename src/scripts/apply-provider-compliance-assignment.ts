import { db, sql } from "astro:db"

const statements = [
	`CREATE TABLE IF NOT EXISTS "ProviderComplianceAssignment" (
		"id" TEXT PRIMARY KEY NOT NULL,
		"providerId" TEXT NOT NULL REFERENCES "Provider"("id"),
		"domain" TEXT NOT NULL,
		"entityId" TEXT NOT NULL,
		"assigneeEmail" TEXT,
		"slaHours" INTEGER NOT NULL DEFAULT 48,
		"slaDueAt" TEXT NOT NULL,
		"status" TEXT NOT NULL DEFAULT 'open',
		"notes" TEXT,
		"createdBy" TEXT REFERENCES "User"("id"),
		"createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		"updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE INDEX IF NOT EXISTS "ProviderComplianceAssignment_providerId_domain_status_idx"
		ON "ProviderComplianceAssignment" ("providerId", "domain", "status")`,
	`CREATE INDEX IF NOT EXISTS "ProviderComplianceAssignment_slaDueAt_idx"
		ON "ProviderComplianceAssignment" ("slaDueAt")`,
	`CREATE INDEX IF NOT EXISTS "ProviderComplianceAssignment_providerId_entityId_idx"
		ON "ProviderComplianceAssignment" ("providerId", "entityId")`,
]

export default async function applyProviderComplianceAssignment() {
	for (const statement of statements) {
		try {
			await db.run(sql.raw(statement))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (message.includes("already exists") || message.includes("duplicate")) {
				continue
			}
			throw error
		}
	}

	console.log(
		JSON.stringify(
			{
				migration: "provider_compliance_assignment",
				applied: statements.length,
			},
			null,
			2
		)
	)
}
