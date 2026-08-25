import "dotenv/config"

import postgres from "postgres"

import { ensureCleanPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

ensureCleanPostgresEnv()

type ForeignKey = {
	schemaName: string
	tableName: string
	columnName: string
	constraintName: string
	deleteRule: string
}

type QueryableSql = postgres.Sql | postgres.TransactionSql

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`

async function foreignKeysTo(sql: QueryableSql, targetTable: string): Promise<ForeignKey[]> {
	return sql<ForeignKey[]>`
		select
			n.nspname as "schemaName",
			c.relname as "tableName",
			a.attname as "columnName",
			con.conname as "constraintName",
			case con.confdeltype
				when 'c' then 'cascade'
				when 'n' then 'set_null'
				when 'd' then 'set_default'
				when 'r' then 'restrict'
				else 'no_action'
			end as "deleteRule"
		from pg_constraint con
		join pg_class c on c.oid = con.conrelid
		join pg_namespace n on n.oid = c.relnamespace
		join pg_attribute a on a.attrelid = c.oid and a.attnum = con.conkey[1]
		where con.contype = 'f'
			and con.confrelid = ${targetTable}::regclass
			and array_length(con.conkey, 1) = 1
			and n.nspname = 'public'
		order by n.nspname, c.relname, a.attname
	`
}

async function countDependents(
	sql: QueryableSql,
	targetTable: string,
	ids: string[]
) {
	if (ids.length === 0) return []
	const foreignKeys = await foreignKeysTo(sql, targetTable)
	return Promise.all(
		foreignKeys.map(async (foreignKey) => {
			const table = `${quoteIdentifier(foreignKey.schemaName)}.${quoteIdentifier(foreignKey.tableName)}`
			const column = quoteIdentifier(foreignKey.columnName)
			const rows = await sql.unsafe<{ count: number }[]>(
				`select count(*)::int as count from ${table} where ${column} = any($1::text[])`,
				[ids]
			)
			return { ...foreignKey, rows: rows[0]?.count ?? 0 }
		})
	)
}

async function main() {
	const sql = postgres(getPostgresConnectionUrl("direct"), { max: 1, prepare: false })
	try {
		const report = await sql.begin(async (tx) => {
			await tx`set transaction read only`
			const candidates = await tx<{
				id: string
				name: string
				productType: string
				dataClass: string
			}[]>`
				select p."id", p."name", p."productType", p."dataClass"
				from "Product" p
				where not exists (
					select 1 from "ProductGeoPlace" pgp
					where pgp."productId" = p."id"
						and pgp."role" = 'primary_discovery'
						and pgp."isPrimary" = true
				)
				order by p."dataClass", p."productType", p."id"
			`
			const productIds = candidates.map((candidate) => candidate.id)
			const variantIds = await tx<{ id: string }[]>`
				select "id" from "Variant" where "productId" = any(${productIds}::text[])
			`
			const ratePlanIds = await tx<{ id: string }[]>`
				select rp."id" from "RatePlan" rp
				join "Variant" v on v."id" = rp."variantId"
				where v."productId" = any(${productIds}::text[])
			`
			const [productDependencies, variantDependencies, ratePlanDependencies] = await Promise.all([
				countDependents(tx, '"Product"', productIds),
				countDependents(
					tx,
					'"Variant"',
					variantIds.map((variant) => variant.id)
				),
				countDependents(
					tx,
					'"RatePlan"',
					ratePlanIds.map((ratePlan) => ratePlan.id)
				),
			])
			const imageRows = await tx<{
				productImages: number
				variantImages: number
				objectKeys: number
			}[]>`
				with candidate_products as (
					select unnest(${productIds}::text[]) as id
				), candidate_variants as (
					select v."id" from "Variant" v join candidate_products p on p.id = v."productId"
				)
				select
					count(*) filter (where i."entityId" in (select id from candidate_products))::int as "productImages",
					count(*) filter (where i."entityId" in (select id from candidate_variants))::int as "variantImages",
					count(*) filter (where coalesce(i."objectKey", '') <> '')::int as "objectKeys"
				from "Image" i
				where i."entityId" in (select id from candidate_products)
					or i."entityId" in (select id from candidate_variants)
			`
			const summary = candidates.reduce<Record<string, number>>((result, candidate) => {
				const key = `${candidate.dataClass}:${candidate.productType}`
				result[key] = (result[key] ?? 0) + 1
				return result
			}, {})
			return {
				candidateCount: candidates.length,
				byClassAndType: summary,
				candidates: candidates.slice(0, 50),
				productForeignKeys: productDependencies.filter((row) => row.rows > 0),
				variantForeignKeys: variantDependencies.filter((row) => row.rows > 0),
				ratePlanForeignKeys: ratePlanDependencies.filter((row) => row.rows > 0),
				images: imageRows[0] ?? { productImages: 0, variantImages: 0, objectKeys: 0 },
			}
		})
		console.log(JSON.stringify({ generatedAt: new Date().toISOString(), readOnly: true, ...report }, null, 2))
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
