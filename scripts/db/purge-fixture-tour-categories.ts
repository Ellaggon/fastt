import { config as loadDotenv } from "dotenv"
import postgres from "postgres"

import {
	ensureCleanPostgresEnv,
	stripInvalidPostgresEnv,
} from "../../src/shared/infrastructure/db/clean-db-env"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

stripInvalidPostgresEnv()
delete process.env.FASTT_TEST_DATABASE_URL
loadDotenv({ path: ".env", override: true })
process.env.FASTT_DATA_ENV = "development"
ensureCleanPostgresEnv({ testDotenvPath: "/dev/null" })

const APPLY = process.argv.includes("--apply")
const FIXTURE_SLUG = String.raw`(^|[-_])[0-9a-f]{8}([-_][0-9a-f]{4}){0,4}$`

async function main() {
	const dataEnv = process.env.FASTT_DATA_ENV
	if (dataEnv === "production") {
		throw new Error("Refusing to purge fixture categories against production.")
	}

	const sql = postgres(getPostgresConnectionUrl("direct"), { max: 1 })
	try {
		const fixtures = await sql<
			Array<{ id: string; slug: string; name: string; isActive: boolean; dataClass: string }>
		>`
			select id, slug, name, "isActive", "dataClass"
			from "ProductCategory"
			where vertical = 'tour'
				and (
					lower(coalesce(slug, '')) ~ ${FIXTURE_SLUG}
					or lower(coalesce(name, '')) ~ ${FIXTURE_SLUG}
					or lower(coalesce(slug, '')) like 'inactive-%'
				)
			order by slug
		`

		console.log(`dataEnv=${dataEnv} matching=${fixtures.length}`)
		for (const row of fixtures) {
			console.log(`- ${row.slug} (${row.dataClass}, active=${row.isActive})`)
		}
		if (!APPLY) {
			console.log("Dry run. Re-run with --apply to delete.")
			return
		}

		const result = await sql.begin(async (tx) => {
			await tx`
				insert into "ProductCategoryLink" ("id", "productId", "categoryId", "createdAt")
				select
					md5(link."productId" || ':' || canonical.id),
					link."productId",
					canonical.id,
					now()
				from "ProductCategoryLink" link
				join "ProductCategory" fixture on fixture.id = link."categoryId"
				join "ProductCategory" canonical
					on canonical.vertical = 'tour'
					and canonical."isActive" = true
					and canonical."dataClass" = 'production'
					and canonical.slug = case
						when fixture.slug like 'city-tour-%' then 'city-tour'
						when fixture.slug like 'trekking-%' then 'trekking'
						else null
					end
				where fixture.vertical = 'tour'
					and (
						lower(coalesce(fixture.slug, '')) ~ ${FIXTURE_SLUG}
						or lower(coalesce(fixture.name, '')) ~ ${FIXTURE_SLUG}
						or lower(coalesce(fixture.slug, '')) like 'inactive-%'
					)
				on conflict ("productId", "categoryId") do nothing
			`

			const deletedLinks = await tx`
				delete from "ProductCategoryLink" link
				using "ProductCategory" fixture
				where link."categoryId" = fixture.id
					and fixture.vertical = 'tour'
					and (
						lower(coalesce(fixture.slug, '')) ~ ${FIXTURE_SLUG}
						or lower(coalesce(fixture.name, '')) ~ ${FIXTURE_SLUG}
						or lower(coalesce(fixture.slug, '')) like 'inactive-%'
					)
				returning link.id
			`

			const deletedCategories = await tx`
				delete from "ProductCategory" fixture
				where fixture.vertical = 'tour'
					and (
						lower(coalesce(fixture.slug, '')) ~ ${FIXTURE_SLUG}
						or lower(coalesce(fixture.name, '')) ~ ${FIXTURE_SLUG}
						or lower(coalesce(fixture.slug, '')) like 'inactive-%'
					)
				returning fixture.id, fixture.slug
			`

			return { deletedLinks: deletedLinks.length, deletedCategories: deletedCategories.length }
		})

		console.log(
			`Deleted ${result.deletedCategories} fixture categories and ${result.deletedLinks} links.`
		)
	} finally {
		await sql.end({ timeout: 5 })
	}
}

void main()
