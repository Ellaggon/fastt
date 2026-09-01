import "dotenv/config"

import { randomUUID } from "node:crypto"

import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
	db,
	eq,
	FiscalActivityEvent,
	Provider,
	TaxFeeDefinition,
	TaxFeeDefinitionDraft,
	TaxFeeDefinitionVersion,
	User,
} from "@/shared/infrastructure/db/compat"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"
import {
	publishTaxFeeDefinition,
	saveTaxFeeDefinitionDraft,
	TaxFeeDefinitionPublicationConflictError,
} from "@/lib/taxes-fees/tax-fee-versioning"

const isolated =
	process.env.FASTT_DATA_ENV === "test"
		? prepareIsolatedTestDatabase()
		: { configured: false as const }
const connectionUrl = isolated.configured ? (isolated.directUrl ?? isolated.runtimeUrl) : ""
const describePostgres = connectionUrl ? describe : describe.skip
const prefix = `tax-version-${randomUUID()}`

describePostgres("Tax fee current version integrity", () => {
	let sql: postgres.Sql

	async function insertDraftDefinition(tx: postgres.TransactionSql, id: string) {
		await tx`
			insert into "TaxFeeDefinition" (
				"id", "code", "name", "kind", "calculationType", "value",
				"inclusionType", "appliesPer", "priority", "status", "editingState"
			)
			values (${id}, ${id}, 'Version integrity rule', 'tax', 'percentage', 10,
				'excluded', 'stay', 0, 'archived', 'draft')
		`
	}

	async function insertVersion(
		tx: postgres.TransactionSql,
		input: { id: string; definitionId: string; version: number }
	) {
		await tx`
			insert into "TaxFeeDefinitionVersion" (
				"id", "taxFeeDefinitionId", "version", "publicationState", "snapshotJson"
			)
			values (${input.id}, ${input.definitionId}, ${input.version}, 'published', '{}'::jsonb)
		`
	}

	async function rollbackTransaction(run: (tx: postgres.TransactionSql) => Promise<void>) {
		const rollback = new Error(`rollback-${randomUUID()}`)
		try {
			await sql.begin(async (tx) => {
				await run(tx)
				throw rollback
			})
		} catch (error) {
			if (error === rollback) return
			throw error
		}
	}

	beforeAll(async () => {
		sql = postgres(connectionUrl, { max: 1, prepare: false })
	})

	afterAll(async () => {
		if (sql) {
			await sql.end()
		}
	})

	it("keeps drafts versionless while accepting a version owned by its definition", async () => {
		const draftId = `${prefix}-draft`
		const definitionId = `${prefix}-definition-a`
		const versionId = `${prefix}-version-a`

		await rollbackTransaction(async (tx) => {
			await insertDraftDefinition(tx, draftId)
			await insertDraftDefinition(tx, definitionId)
			await insertVersion(tx, { id: versionId, definitionId, version: 1 })
			await tx`
				update "TaxFeeDefinition"
				set "currentVersionId" = ${versionId}, "editingState" = 'published', "status" = 'active'
				where "id" = ${definitionId}
			`
			await tx`set constraints all immediate`

			const [rows, constraints] = await Promise.all([
				tx`
				select "id", "currentVersionId"
				from "TaxFeeDefinition"
				where "id" in (${draftId}, ${definitionId})
				order by "id"
			`,
				tx`
				select condeferrable, condeferred
				from pg_constraint
				where conname = 'TaxFeeDefinition_currentVersion_same_definition_fk'
			`,
			])

			expect(rows.find((row) => row.id === draftId)?.currentVersionId).toBeNull()
			expect(rows.find((row) => row.id === definitionId)?.currentVersionId).toBe(versionId)
			expect(constraints).toEqual([{ condeferrable: true, condeferred: true }])
		})
	})

	it("rejects a current version owned by another definition at transaction commit", async () => {
		const definitionA = `${prefix}-cross-a`
		const definitionB = `${prefix}-cross-b`
		const versionB = `${prefix}-cross-version-b`
		await expect(
			sql.begin(async (tx) => {
				await insertDraftDefinition(tx, definitionA)
				await insertDraftDefinition(tx, definitionB)
				await insertVersion(tx, { id: versionB, definitionId: definitionB, version: 1 })
				await tx`
					update "TaxFeeDefinition"
					set "currentVersionId" = ${versionB}, "editingState" = 'published', "status" = 'active'
					where "id" = ${definitionA}
				`
				await tx`set constraints all immediate`
			})
		).rejects.toThrow(/TaxFeeDefinition_currentVersion_same_definition_fk/)
	})

	it("rejects a published definition without a current version", async () => {
		await expect(
			sql.begin(async (tx) => {
				const definitionId = `${prefix}-published-without-version`
				await insertDraftDefinition(tx, definitionId)
				await tx`
					update "TaxFeeDefinition"
					set "editingState" = 'published', "status" = 'active'
					where "id" = ${definitionId}
				`
				await tx`set constraints all immediate`
			})
		).rejects.toThrow(/TAX_FEE_PUBLISHED_DEFINITION_REQUIRES_CURRENT_VERSION/)
	})

	it("rejects changes to released version evidence", async () => {
		await expect(
			sql.begin(async (tx) => {
				const definitionId = `${prefix}-immutable-definition`
				const versionId = `${prefix}-immutable-version`
				await insertDraftDefinition(tx, definitionId)
				await insertVersion(tx, { id: versionId, definitionId, version: 1 })
				await tx`
					update "TaxFeeDefinitionVersion"
					set "snapshotJson" = '{"changed":true}'::jsonb
					where "id" = ${versionId}
				`
			})
		).rejects.toThrow(/TAX_FEE_DEFINITION_VERSION_IMMUTABLE/)
	})

	it("rejects a stale publication token without changing the released definition", async () => {
		const actorId = `${prefix}-publication-actor`
		const providerId = `${prefix}-publication-provider`
		const definitionId = `${prefix}-publication-definition`
		const rollback = new Error(`rollback-${randomUUID()}`)

		try {
			await db.transaction(async (tx) => {
				await tx.insert(Provider).values({
					id: providerId,
					legalName: "Fiscal publication test provider",
					status: "active",
					accountPurpose: "internal_qa",
					dataClassification: "fixture",
				})
				await tx.insert(User).values({
					id: actorId,
					email: `${actorId}@fastt.local`,
					firstName: "Fiscal",
					lastName: "Publisher",
				})
				await tx.insert(TaxFeeDefinition).values({
					id: definitionId,
					providerId,
					code: "CONCURRENCY_TEST",
					name: "Regla de concurrencia",
					kind: "tax",
					calculationType: "percentage",
					value: 10,
					inclusionType: "excluded",
					appliesPer: "stay",
					priority: 0,
					status: "archived",
					editingState: "draft",
				})

				const firstPublication = await publishTaxFeeDefinition(
					{
						definitionId,
						actorUserId: actorId,
						providerId,
						publicationState: "published",
						expectedCurrentVersionId: null,
						expectedRevision: 0,
					},
					{ transaction: tx }
				)

				await expect(
					publishTaxFeeDefinition(
						{
							definitionId,
							actorUserId: actorId,
							providerId,
							publicationState: "published",
							expectedCurrentVersionId: null,
							expectedRevision: 0,
						},
						{ transaction: tx }
					)
				).rejects.toBeInstanceOf(TaxFeeDefinitionPublicationConflictError)

				const [definition, versions] = await Promise.all([
					tx
						.select({ currentVersionId: TaxFeeDefinition.currentVersionId })
						.from(TaxFeeDefinition)
						.where(eq(TaxFeeDefinition.id, definitionId)),
					tx
						.select({ id: TaxFeeDefinitionVersion.id, version: TaxFeeDefinitionVersion.version, snapshotJson: TaxFeeDefinitionVersion.snapshotJson })
						.from(TaxFeeDefinitionVersion)
						.where(eq(TaxFeeDefinitionVersion.taxFeeDefinitionId, definitionId)),
				])
				expect(definition).toEqual([{ currentVersionId: firstPublication.id }])
				expect(versions).toEqual([{ id: firstPublication.id, version: 1, snapshotJson: expect.objectContaining({ schemaVersion: 2 }) }])

				await saveTaxFeeDefinitionDraft({
					definitionId,
					providerId,
					actorUserId: actorId,
					patch: {
						code: "CONCURRENCY_TEST",
						name: "Regla editada sin afectar ventas",
						kind: "tax",
						calculationType: "percentage",
						value: 15,
						currency: null,
						inclusionType: "excluded",
						appliesPer: "stay",
						priority: 0,
						jurisdictionJson: null,
						effectiveFrom: null,
						effectiveTo: null,
					},
				}, { transaction: tx })
				const [publishedWhileEditing, draft] = await Promise.all([
					tx.select({ value: TaxFeeDefinition.value }).from(TaxFeeDefinition).where(eq(TaxFeeDefinition.id, definitionId)),
					tx.select({ value: TaxFeeDefinitionDraft.value }).from(TaxFeeDefinitionDraft).where(eq(TaxFeeDefinitionDraft.definitionId, definitionId)),
				])
				expect(publishedWhileEditing).toEqual([{ value: 10 }])
				expect(draft).toEqual([{ value: 15 }])

				const secondPublication = await publishTaxFeeDefinition(
					{ definitionId, providerId, actorUserId: actorId, publicationState: "published", expectedCurrentVersionId: firstPublication.id, expectedRevision: 1 },
					{ transaction: tx }
				)
				const [released, remainingDrafts, activity] = await Promise.all([
					tx.select({ value: TaxFeeDefinition.value, currentVersionId: TaxFeeDefinition.currentVersionId }).from(TaxFeeDefinition).where(eq(TaxFeeDefinition.id, definitionId)),
					tx.select().from(TaxFeeDefinitionDraft).where(eq(TaxFeeDefinitionDraft.definitionId, definitionId)),
					tx.select({ versionId: FiscalActivityEvent.definitionVersionId }).from(FiscalActivityEvent).where(eq(FiscalActivityEvent.definitionId, definitionId)),
				])
				expect(released).toEqual([{ value: 15, currentVersionId: secondPublication.id }])
				expect(remainingDrafts).toHaveLength(0)
				expect(activity.map((event) => event.versionId).sort()).toEqual([firstPublication.id, secondPublication.id].sort())

				throw rollback
			})
		} catch (error) {
			if (error !== rollback) throw error
		}
	})
})
