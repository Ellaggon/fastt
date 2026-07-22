import { ProviderFinancialProfile as ProviderFinancialProfileTable, db, eq } from "astro:db"

import type {
	ProviderFinancialProfileCreateInput,
	ProviderFinancialProfileRepositoryPort,
} from "../../application/ports/ProviderFinanceRepositoryPort"
import type { ProviderFinancialProfile } from "../../domain/provider-financial-profile"
import { assertHasVerifiedPaymentAccount } from "@/lib/provider-payment-accounts"

function map(row: any): ProviderFinancialProfile {
	return {
		providerId: String(row.providerId),
		payoutMethodReference: row.payoutMethodReference ?? null,
		payoutSchedule: String(row.payoutSchedule),
		currency: String(row.currency ?? "").toUpperCase(),
		taxProfileStatus: String(row.taxProfileStatus) as ProviderFinancialProfile["taxProfileStatus"],
		status: String(row.status) as ProviderFinancialProfile["status"],
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt),
	}
}

export class ProviderFinancialProfileRepository implements ProviderFinancialProfileRepositoryPort {
	async findByProviderId(providerId: string): Promise<ProviderFinancialProfile | null> {
		const key = String(providerId ?? "").trim()
		if (!key) return null
		const row = await db
			.select()
			.from(ProviderFinancialProfileTable)
			.where(eq(ProviderFinancialProfileTable.providerId, key))
			.get()
		return row ? map(row) : null
	}

	async upsert(input: ProviderFinancialProfileCreateInput): Promise<ProviderFinancialProfile> {
		// ready is a rollup of verified payout — never invent readiness without an account.
		if (String(input.status) === "ready") {
			await assertHasVerifiedPaymentAccount(input.providerId)
		}

		const existing = await this.findByProviderId(input.providerId)
		const now = new Date()
		if (existing) {
			await db
				.update(ProviderFinancialProfileTable)
				.set({ ...input, updatedAt: now } as any)
				.where(eq(ProviderFinancialProfileTable.providerId, input.providerId))
				.run()
			return { ...existing, ...input, updatedAt: now }
		}
		const row = { ...input, createdAt: now, updatedAt: now }
		await db
			.insert(ProviderFinancialProfileTable)
			.values(row as any)
			.run()
		return map(row)
	}
}
