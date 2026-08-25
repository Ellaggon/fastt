import "dotenv/config"

import { DeleteObjectsCommand } from "@aws-sdk/client-s3"
import postgres from "postgres"

import { r2 } from "../../src/container/shared.container"
import { ensureCleanPostgresEnv } from "../../src/shared/infrastructure/db/clean-db-env"
import { getFasttDataEnvironment } from "../../src/shared/infrastructure/db/runtime-environment"
import { getPostgresConnectionUrl } from "../../src/shared/infrastructure/db/env"

ensureCleanPostgresEnv()

const APPLY = process.argv.includes("--apply")
const CONFIRMED = process.env.CONFIRM_LEGACY_PRODUCT_PURGE === "delete"

type Relation = {
	oid: string
	schemaName: string
	tableName: string
	primaryKey: string | null
}

type ForeignKey = {
	childOid: string
	childSchema: string
	childTable: string
	childColumn: string
	constraintName: string
}

type DirectProductReference = {
	schemaName: string
	tableName: string
	columnName: string
}

type Closure = {
	relations: Map<string, Relation>
	idsByRelation: Map<string, Set<string>>
	depthByRelation: Map<string, number>
	childrenByRelation: Map<string, Set<string>>
}

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`
const relationName = (relation: Pick<Relation, "schemaName" | "tableName">) =>
	`${quoteIdentifier(relation.schemaName)}.${quoteIdentifier(relation.tableName)}`
const relationKey = (relation: Pick<Relation, "oid">) => relation.oid

async function relationByOid(sql: postgres.TransactionSql, oid: string): Promise<Relation> {
	const rows = await sql<Relation[]>`
		select
			c.oid::text as oid,
			n.nspname as "schemaName",
			c.relname as "tableName",
			(
				select a.attname
				from pg_index i
				join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
				where i.indrelid = c.oid and i.indisprimary and array_length(i.indkey, 1) = 1
			) as "primaryKey"
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where c.oid = ${oid}::oid
	`
	const relation = rows[0]
	if (!relation || relation.schemaName !== "public" || !relation.primaryKey) {
		throw new Error(`Cannot safely purge relation ${oid}: it needs a single-column primary key.`)
	}
	return relation
}

async function childForeignKeys(sql: postgres.TransactionSql, parentOid: string): Promise<ForeignKey[]> {
	return sql<ForeignKey[]>`
		select
			con.conrelid::text as "childOid",
			n.nspname as "childSchema",
			c.relname as "childTable",
			a.attname as "childColumn",
			con.conname as "constraintName"
		from pg_constraint con
		join pg_class c on c.oid = con.conrelid
		join pg_namespace n on n.oid = c.relnamespace
		join pg_attribute a on a.attrelid = c.oid and a.attnum = con.conkey[1]
		where con.contype = 'f'
			and con.confrelid = ${parentOid}::oid
			and array_length(con.conkey, 1) = 1
			and array_length(con.confkey, 1) = 1
			and n.nspname = 'public'
		order by n.nspname, c.relname, a.attname
	`
}

async function getRootRelation(sql: postgres.TransactionSql): Promise<Relation> {
	const rows = await sql<{ oid: string }[]>`select '"Product"'::regclass::oid::text as oid`
	return relationByOid(sql, rows[0]!.oid)
}

async function legacyProductIds(sql: postgres.TransactionSql) {
	const rows = await sql<{ id: string }[]>`
		select p."id"
		from "Product" p
		where not exists (
			select 1 from "ProductGeoPlace" pgp
			where pgp."productId" = p."id"
				and pgp."role" = 'primary_discovery'
				and pgp."isPrimary" = true
		)
		order by p."id"
	`
	return rows.map((row) => row.id)
}

async function managedImageKeys(sql: postgres.TransactionSql, productIds: string[]) {
	const rows = await sql<{ objectKey: string }[]>`
		with candidate_variants as (
			select "id" from "Variant" where "productId" = any(${productIds}::text[])
		)
		select distinct "objectKey"
		from "Image"
		where coalesce("objectKey", '') <> ''
			and (
				"entityId" = any(${productIds}::text[])
				or "entityId" in (select "id" from candidate_variants)
				or "objectKey" like any(array(select 'products/' || id || '/%' from unnest(${productIds}::text[]) id))
			)
		union
		select distinct "objectKey"
		from "ImageUpload"
		where coalesce("objectKey", '') <> ''
			and "objectKey" like any(array(select 'products/' || id || '/%' from unnest(${productIds}::text[]) id))
	`
	return rows.map((row) => row.objectKey)
}

async function deleteManagedR2Objects(keys: string[]) {
	if (keys.length === 0) return
	if (!process.env.R2_BUCKET_NAME?.trim()) {
		throw new Error("R2_BUCKET_NAME is required to purge managed product images.")
	}
	for (let index = 0; index < keys.length; index += 1_000) {
		const batch = keys.slice(index, index + 1_000)
		const result = await r2.send(
			new DeleteObjectsCommand({
				Bucket: process.env.R2_BUCKET_NAME,
				Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
			})
		)
		if (result.Errors?.length) {
			throw new Error(
				`R2 refused ${result.Errors.length} managed image deletion(s): ${result.Errors
					.map((error) => error.Key)
					.filter(Boolean)
					.join(", ")}`
			)
		}
	}
}

async function deleteNonForeignKeyReferences(
	sql: postgres.TransactionSql,
	productIds: string[],
	variantIds: string[],
	ratePlanIds: string[],
	imageKeys: string[]
) {
	const scopes = [
		{ type: "product", ids: productIds },
		{ type: "variant", ids: variantIds },
		{ type: "rate_plan", ids: ratePlanIds },
	]
	for (const scope of scopes) {
		if (scope.ids.length === 0) continue
		for (const table of [
			// PolicyAuditLog references PolicyAssignment; it must be removed first.
			"PolicyAuditLog",
			"TaxFeeAssignment",
			"PolicyAssignment",
			"PolicyExceptionRule",
			"CommercialRuleApplication",
		]) {
			await sql.unsafe(
				`delete from ${quoteIdentifier(table)} where "scope" = $1 and "scopeId" = any($2::text[])`,
				[scope.type, scope.ids]
			)
		}
	}
	for (const entity of [
		{ type: "product", ids: productIds },
		{ type: "variant", ids: variantIds },
	]) {
		if (entity.ids.length === 0) continue
		await sql.unsafe(
			`delete from "ProviderIntegrationMapping" where "localEntityType" = $1 and "localEntityId" = any($2::text[])`,
			[entity.type, entity.ids]
		)
	}
	if (imageKeys.length > 0) {
		await sql`delete from "ImageUpload" where "objectKey" = any(${imageKeys}::text[])`
	}
	await sql`
		delete from "Image"
		where "entityId" = any(${productIds}::text[])
			or "objectKey" = any(${imageKeys}::text[])
	`
}

async function collectClosure(tx: postgres.TransactionSql, productIds: string[]): Promise<Closure> {
	const root = await getRootRelation(tx)
	const relations = new Map<string, Relation>([[relationKey(root), root]])
	const idsByRelation = new Map<string, Set<string>>([[relationKey(root), new Set(productIds)]])
	const depthByRelation = new Map<string, number>([[relationKey(root), 0]])
	const childrenByRelation = new Map<string, Set<string>>()
	const processedIdsByRelation = new Map<string, Set<string>>()
	const queue: Array<{ relation: Relation; ids: string[] }> = [{ relation: root, ids: productIds }]

	for (let index = 0; index < queue.length; index += 1) {
		const { relation: parent, ids: queuedIds } = queue[index]!
		const parentKey = relationKey(parent)
		const processedIds = processedIdsByRelation.get(parentKey) ?? new Set<string>()
		const parentIds = queuedIds.filter((id) => !processedIds.has(id))
		if (parentIds.length === 0) continue
		for (const id of parentIds) processedIds.add(id)
		processedIdsByRelation.set(parentKey, processedIds)

		const children = await childForeignKeys(tx, parent.oid)
		for (const child of children) {
			let childRelation = relations.get(child.childOid)
			if (!childRelation) {
				childRelation = await relationByOid(tx, child.childOid)
				relations.set(child.childOid, childRelation)
			}
			const rows = await tx.unsafe<{ id: string }[]>(
				`select distinct ${quoteIdentifier(childRelation.primaryKey!)} as id from ${relationName(childRelation)} where ${quoteIdentifier(child.childColumn)} = any($1::text[])`,
				[parentIds]
			)
			if (rows.length === 0) continue
			const childKeys = childrenByRelation.get(parentKey) ?? new Set<string>()
			childKeys.add(child.childOid)
			childrenByRelation.set(parentKey, childKeys)

			const childIds = idsByRelation.get(child.childOid) ?? new Set<string>()
			const newIds: string[] = []
			for (const row of rows) {
				const id = String(row.id)
				if (!childIds.has(id)) {
					childIds.add(id)
					newIds.push(id)
				}
			}
			idsByRelation.set(child.childOid, childIds)
			if (newIds.length === 0) continue
			depthByRelation.set(
				child.childOid,
				Math.max(depthByRelation.get(child.childOid) ?? 0, (depthByRelation.get(parentKey) ?? 0) + 1)
			)
			queue.push({ relation: childRelation, ids: newIds })
		}
	}

	return { relations, idsByRelation, depthByRelation, childrenByRelation }
}

function deletionOrder(closure: Closure) {
	const visiting = new Set<string>()
	const visited = new Set<string>()
	const ordered: Relation[] = []
	const visit = (relationKeyValue: string) => {
		if (visited.has(relationKeyValue)) return
		if (visiting.has(relationKeyValue)) {
			throw new Error(`Cannot safely purge a cyclic foreign-key dependency at ${relationKeyValue}.`)
		}
		visiting.add(relationKeyValue)
		for (const childKey of closure.childrenByRelation.get(relationKeyValue) ?? []) visit(childKey)
		visiting.delete(relationKeyValue)
		visited.add(relationKeyValue)
		const relation = closure.relations.get(relationKeyValue)
		if (relation && (closure.idsByRelation.get(relationKeyValue)?.size ?? 0) > 0) ordered.push(relation)
	}
	for (const key of closure.relations.keys()) visit(key)
	return ordered
}

async function directProductReferenceCounts(tx: postgres.TransactionSql, productIds: string[]) {
	if (productIds.length === 0) return []
	const references = await tx<DirectProductReference[]>`
		select table_schema as "schemaName", table_name as "tableName", column_name as "columnName"
		from information_schema.columns
		where table_schema = 'public'
			and table_name <> 'Product'
			and column_name in ('productId', 'sourceProductId', 'targetProductId', 'productIdSnapshot')
		order by table_name, column_name
	`
	const results = []
	for (const reference of references) {
		const rows = await tx.unsafe<{ rows: number }[]>(
			`select count(*)::int as rows from ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)} where ${quoteIdentifier(reference.columnName)}::text = any($1::text[])`,
			[productIds]
		)
		if ((rows[0]?.rows ?? 0) > 0) results.push({ ...reference, rows: rows[0]!.rows })
	}
	return results
}

function closureSummary(closure: Closure) {
	return [...closure.relations.values()]
		.map((relation) => ({
			table: relation.tableName,
			rows: closure.idsByRelation.get(relation.oid)?.size ?? 0,
			depth: closure.depthByRelation.get(relation.oid) ?? 0,
		}))
		.filter((relation) => relation.rows > 0)
		.sort((left, right) => right.depth - left.depth || left.table.localeCompare(right.table))
}

async function purgeDatabase(sql: postgres.Sql, productIds: string[], imageKeys: string[]) {
	return sql.begin(async (tx) => {
		const { relations, idsByRelation, depthByRelation, childrenByRelation } = await collectClosure(tx, productIds)

		const variantRelation = [...relations.values()].find((relation) => relation.tableName === "Variant")
		const ratePlanRelation = [...relations.values()].find((relation) => relation.tableName === "RatePlan")
		const variantIds = variantRelation ? [...(idsByRelation.get(variantRelation.oid) ?? [])] : []
		const ratePlanIds = ratePlanRelation ? [...(idsByRelation.get(ratePlanRelation.oid) ?? [])] : []
		await deleteNonForeignKeyReferences(tx, productIds, variantIds, ratePlanIds, imageKeys)

		const ordered = deletionOrder({ relations, idsByRelation, depthByRelation, childrenByRelation })
		for (const relation of ordered) {
			const ids = [...(idsByRelation.get(relation.oid) ?? [])]
			await tx.unsafe(
				`delete from ${relationName(relation)} where ${quoteIdentifier(relation.primaryKey!)} = any($1::text[])`,
				[ids]
			)
		}

		return {
			deletedProducts: productIds.length,
			deletedVariants: variantIds.length,
			deletedRatePlans: ratePlanIds.length,
			deletedRelations: ordered.map((relation) => ({
				table: relation.tableName,
				rows: idsByRelation.get(relation.oid)?.size ?? 0,
			})),
		}
	})
}

async function main() {
	if (getFasttDataEnvironment() !== "development") {
		throw new Error("Legacy product purge is allowed only with FASTT_DATA_ENV=development.")
	}
	if (APPLY && !CONFIRMED) {
		throw new Error("PURGE_CONFIRMATION_REQUIRED: set CONFIRM_LEGACY_PRODUCT_PURGE=delete.")
	}

	const sql = postgres(getPostgresConnectionUrl("direct"), { max: 1, prepare: false })
	try {
		const preflight = await sql.begin(async (tx) => {
			await tx`set transaction read only`
			const productIds = await legacyProductIds(tx)
			// postgres uses one connection for this transaction; keep discovery serial to avoid a queued-query deadlock.
			const imageKeys = await managedImageKeys(tx, productIds)
			const closure = await collectClosure(tx, productIds)
			const directReferences = await directProductReferenceCounts(tx, productIds)
			return { productIds, imageKeys, closure, directReferences }
		})
		const { productIds, imageKeys } = preflight
		if (!APPLY) {
			console.log(
				JSON.stringify(
					{
						action: "dry_run",
						products: productIds.length,
						imageKeys: imageKeys.length,
						closure: closureSummary(preflight.closure),
						directProductReferences: preflight.directReferences,
					},
					null,
					2
				)
			)
			return
		}
		await deleteManagedR2Objects(imageKeys)
		const result = await purgeDatabase(sql, productIds, imageKeys)
		console.log(JSON.stringify({ action: "purged", imageKeys: imageKeys.length, ...result }, null, 2))
	} finally {
		await sql.end()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
