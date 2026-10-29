import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prepareIsolatedTestDatabase } from "@/shared/infrastructure/db/data-environment"

const isolated = prepareIsolatedTestDatabase()
const suite = isolated.configured ? describe : describe.skip
suite("document definition persistence", () => {
	let sql: postgres.Sql
	beforeAll(() => {
		if (!isolated.configured) return
		sql = postgres(isolated.directUrl ?? isolated.runtimeUrl, { max: 1 })
	})
	afterAll(async () => {
		if (sql) await sql.end()
	})
	it("protects published definitions against mutation and deletion", async () => {
		const id = crypto.randomUUID()
		await sql
			.begin(async (tx) => {
				await tx`INSERT INTO "DocumentDefinition" (id, key) VALUES (${id}, ${id})`
				await tx`INSERT INTO "DocumentDefinitionVersion" (id, "definitionId", version, status, label, description, family, "captureJson") VALUES (${id}, ${id}, 1, 'published', 'Identity', 'Test', 'government_id', '{}')`
				await expect(
					tx.savepoint(async (sp) => {
						await sp`UPDATE "DocumentDefinitionVersion" SET label = 'Changed' WHERE id = ${id}`
					})
				).rejects.toThrow("document_definition_immutable")
				await expect(
					tx.savepoint(async (sp) => {
						await sp`DELETE FROM "DocumentDefinitionVersion" WHERE id = ${id}`
					})
				).rejects.toThrow("document_definition_immutable")
				await tx`UPDATE "DocumentDefinitionVersion" SET status = 'retired' WHERE id = ${id}`
				await expect(
					tx.savepoint(async (sp) => {
						await sp`UPDATE "DocumentDefinitionVersion" SET status = 'published' WHERE id = ${id}`
					})
				).rejects.toThrow("document_definition_immutable")
				throw new Error("rollback_fixture")
			})
			.catch((error) => {
				if (error.message !== "rollback_fixture") throw error
			})
	})
	it("rejects drafts for new evidence and cross-provider replacement", async () => {
		const a = crypto.randomUUID(),
			b = crypto.randomUUID(),
			d = crypto.randomUUID(),
			v = crypto.randomUUID()
		await sql
			.begin(async (tx) => {
				await tx`INSERT INTO "Provider" (id) VALUES (${a}), (${b})`
				await tx`INSERT INTO "DocumentDefinition" (id,key) VALUES (${v}, ${v})`
				await tx`INSERT INTO "DocumentDefinitionVersion" (id,"definitionId",version,label,description,family,"captureJson") VALUES (${v},${v},1,'Test','Test','government_id','{}')`
				await expect(
					tx.savepoint(async (sp) => {
						await sp`INSERT INTO "ProviderDocument" (id,"providerId",type,"definitionVersionId") VALUES (${d},${a},'government_id',${v})`
					})
				).rejects.toThrow("document_definition_not_published")
				await tx`INSERT INTO "ProviderDocument" (id,"providerId",type) VALUES (${d},${a},'government_id')`
				await expect(
					tx.savepoint(async (sp) => {
						await sp`INSERT INTO "ProviderDocument" (id,"providerId",type,"replacesDocumentId") VALUES (${crypto.randomUUID()},${b},'government_id',${d})`
					})
				).rejects.toThrow("invalid_document_replacement")
				throw new Error("rollback_fixture")
			})
			.catch((error) => {
				if (error.message !== "rollback_fixture") throw error
			})
	})
})
