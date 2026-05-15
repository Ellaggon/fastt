import { desc, eq, PaymentAttempt as PaymentAttemptTable, db } from "astro:db"

import type {
	PaymentAttemptCreateInput,
	PaymentAttemptRepositoryPort,
} from "../../application/ports/FinancialStage3RepositoryPort"
import type { PaymentAttempt } from "../../domain/payment-attempt"

function map(row: any): PaymentAttempt {
	return {
		id: String(row.id),
		paymentTransactionId: String(row.paymentTransactionId),
		attemptType: String(row.attemptType) as PaymentAttempt["attemptType"],
		status: String(row.status) as PaymentAttempt["status"],
		failureReason: row.failureReason ?? null,
		externalReference: row.externalReference ?? null,
		createdAt: new Date(row.createdAt),
	}
}

export class PaymentAttemptRepository implements PaymentAttemptRepositoryPort {
	async findByTransactionId(paymentTransactionId: string): Promise<PaymentAttempt[]> {
		const key = String(paymentTransactionId ?? "").trim()
		if (!key) return []
		const rows = await db
			.select()
			.from(PaymentAttemptTable)
			.where(eq(PaymentAttemptTable.paymentTransactionId, key))
			.orderBy(desc(PaymentAttemptTable.createdAt))
			.all()
		return rows.map(map)
	}

	async create(input: PaymentAttemptCreateInput): Promise<PaymentAttempt> {
		const row = { ...input, id: input.id ?? crypto.randomUUID(), createdAt: new Date() }
		await db
			.insert(PaymentAttemptTable)
			.values(row as any)
			.run()
		return map(row)
	}
}
