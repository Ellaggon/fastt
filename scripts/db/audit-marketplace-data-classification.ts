import postgres from "postgres"

import { ensureCleanPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

ensureCleanPostgresEnv()

async function main() {
	const sql = postgres(getPostgresConnectionUrl("direct"), { max: 1, prepare: false })
	try {
		const report = await sql.begin(async (tx) => {
			await tx`set transaction read only`
			const [providers, orphanProducts, fixtureCandidates, demoCandidates] = await Promise.all([
				tx<{ classification: string; providers: number; products: number }[]>`
					select
						coalesce(pr."dataClassification", 'unclassified') as classification,
						count(distinct pr."id")::int as providers,
						count(p."id")::int as products
					from "Provider" pr
					left join "Product" p on p."providerId" = pr."id"
					group by coalesce(pr."dataClassification", 'unclassified')
					order by classification
				`,
				tx<{ products: number }[]>`
					select count(*)::int as products
					from "Product" p
					left join "Provider" pr on pr."id" = p."providerId"
					where p."providerId" is null or pr."id" is null
				`,
				tx<{ providerId: string; displayName: string | null; products: number }[]>`
					select pr."id" as "providerId", pr."displayName", count(p."id")::int as products
					from "Provider" pr
					left join "Product" p on p."providerId" = pr."id"
					where lower(coalesce(pr."displayName", '') || ' ' || coalesce(pr."legalName", ''))
						like any(array['%demo%', '%fixture%', '%test%', '%qa%'])
					group by pr."id", pr."displayName"
					order by products desc, pr."id"
				`,
				tx<{ productId: string; name: string; providerId: string | null }[]>`
					select p."id" as "productId", p."name", p."providerId"
					from "Product" p
					where lower(p."name") like any(array['%demo%', '%fixture%', '%test%', '%qa%'])
					order by p."id"
				`,
			])
			return {
				providers,
				orphanProducts: orphanProducts[0]?.products ?? 0,
				fixtureCandidates,
				demoCandidates,
			}
		})
		console.log(
			JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, ...report }, null, 2)
		)
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
