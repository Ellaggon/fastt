import { db, sql } from "astro:db"

const statements = [
	`ALTER TABLE "ProviderInvitation" ADD COLUMN "token" TEXT`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "ProviderInvitation_token_unique" ON "ProviderInvitation" ("token")`,
]

export default async function applyProviderInvitationAcceptToken() {
	for (const statement of statements) {
		try {
			await db.run(sql.raw(statement))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (
				message.includes("duplicate column name") ||
				message.includes("already exists") ||
				message.includes("no such table")
			) {
				continue
			}
			throw error
		}
	}

	console.log(
		JSON.stringify(
			{
				migration: "provider_invitation_accept_token",
				applied: statements.length,
			},
			null,
			2
		)
	)
}
