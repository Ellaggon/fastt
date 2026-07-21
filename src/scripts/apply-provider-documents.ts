import { db, sql } from "astro:db"

const statements = [`ALTER TABLE "ProviderDocument" ADD COLUMN "reviewNotes" TEXT`]

export default async function applyProviderDocuments() {
	for (const statement of statements) {
		try {
			await db.run(sql.raw(statement))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (
				message.includes("duplicate column name") ||
				message.includes("already exists") ||
				message.includes("no such table: ProviderDocument")
			) {
				continue
			}
			throw error
		}
	}

	console.log(
		JSON.stringify(
			{
				migration: "provider_documents_review_notes",
				applied: statements.length,
			},
			null,
			2
		)
	)
}
