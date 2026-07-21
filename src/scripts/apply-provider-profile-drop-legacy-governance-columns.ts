import { db, sql } from "astro:db"

const statements = [
	`ALTER TABLE "ProviderProfile" DROP COLUMN "taxResidenceCountry"`,
	`ALTER TABLE "ProviderProfile" DROP COLUMN "businessRegistrationNumber"`,
	`ALTER TABLE "ProviderProfile" DROP COLUMN "fiscalStatus"`,
	`ALTER TABLE "ProviderProfile" DROP COLUMN "paymentReadinessStatus"`,
	`ALTER TABLE "ProviderProfile" DROP COLUMN "integrationReadinessStatus"`,
]

export default async function applyProviderProfileDropLegacyGovernanceColumns() {
	for (const statement of statements) {
		try {
			await db.run(sql.raw(statement))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (
				message.includes("no such column") ||
				message.includes("Can't drop") ||
				message.includes("no such table: ProviderProfile")
			) {
				continue
			}
			throw error
		}
	}

	console.log(
		JSON.stringify(
			{
				migration: "provider_profile_drop_legacy_governance_columns",
				applied: statements.length,
			},
			null,
			2
		)
	)
}
