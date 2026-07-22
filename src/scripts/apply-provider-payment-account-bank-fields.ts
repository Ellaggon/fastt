import { db, sql } from "astro:db"

const statements = [
	`ALTER TABLE "ProviderPaymentAccount" ADD COLUMN "accountHolderName" TEXT`,
	`ALTER TABLE "ProviderPaymentAccount" ADD COLUMN "bankName" TEXT`,
	`ALTER TABLE "ProviderPaymentAccount" ADD COLUMN "country" TEXT`,
	`ALTER TABLE "ProviderPaymentAccount" ADD COLUMN "routingOrSwift" TEXT`,
	`ALTER TABLE "ProviderPaymentAccount" ADD COLUMN "accountNumberLast4" TEXT`,
]

export default async function applyProviderPaymentAccountBankFields() {
	for (const statement of statements) {
		try {
			await db.run(sql.raw(statement))
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (
				message.includes("duplicate column name") ||
				message.includes("already exists") ||
				message.includes("no such table: ProviderPaymentAccount")
			) {
				continue
			}
			throw error
		}
	}

	console.log(
		JSON.stringify(
			{
				migration: "provider_payment_account_bank_fields",
				applied: statements.length,
			},
			null,
			2
		)
	)
}
