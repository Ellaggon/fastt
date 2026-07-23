import "dotenv/config"

import postgres from "postgres"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

const tables = [
	"ProviderVerification",
	"ProviderInvitation",
	"RatePlanOccupancyPolicy",
	"EffectivePricingV2",
	"TaxFeeDefinition",
	"TaxFeeAssignment",
]

const sql = postgres(getPostgresConnectionUrl("direct"), {
	max: 1,
	prepare: false,
	idle_timeout: 5,
	connect_timeout: 15,
})

async function main() {
	for (const table of tables) {
		await sql`analyze ${sql(table)}`
	}
	console.log("hot_path_tables_analyzed")
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	})
	.finally(async () => {
		await sql.end({ timeout: 5 })
	})
