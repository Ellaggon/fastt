import { FinancialShadowRecord, db, eq } from "astro:db"

import type { FinancialRepositoryPort } from "../../application/ports/FinancialRepositoryPort"
import type { PaymentIntent } from "../../domain/payment-intent"
import type { RefundRecord } from "../../domain/refund-record"
import type { SettlementRecord } from "../../domain/settlement-record"

type BookingFinancialRecords = {
	paymentIntents: PaymentIntent[]
	settlementRecords: SettlementRecord[]
	refundRecords: RefundRecord[]
}

export class FinancialRepository implements FinancialRepositoryPort {
	async savePaymentIntentIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: PaymentIntent
	}): Promise<"created" | "already_exists"> {
		return this.saveIfAbsent({
			idempotencyKey: params.idempotencyKey,
			bookingId: params.record.bookingId,
			type: "payment_intent",
			payload: params.record,
		})
	}

	async saveSettlementRecordIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: SettlementRecord
	}): Promise<"created" | "already_exists"> {
		return this.saveIfAbsent({
			idempotencyKey: params.idempotencyKey,
			bookingId: params.record.bookingId,
			type: "settlement_record",
			payload: params.record,
		})
	}

	async saveRefundRecordIfAbsentByIdempotencyKey(params: {
		idempotencyKey: string
		record: RefundRecord
	}): Promise<"created" | "already_exists"> {
		return this.saveIfAbsent({
			idempotencyKey: params.idempotencyKey,
			bookingId: params.record.bookingId,
			type: "refund_record",
			payload: params.record,
		})
	}

	async findPaymentIntentByIdempotencyKey(idempotencyKey: string): Promise<PaymentIntent | null> {
		const key = String(idempotencyKey ?? "").trim()
		if (!key) return null
		const row = await db
			.select({
				type: FinancialShadowRecord.type,
				payload: FinancialShadowRecord.payload,
			})
			.from(FinancialShadowRecord)
			.where(eq(FinancialShadowRecord.idempotencyKey, key))
			.get()
		if (
			!row ||
			row.type !== "payment_intent" ||
			row.payload == null ||
			typeof row.payload !== "object"
		) {
			return null
		}
		return row.payload as PaymentIntent
	}

	async findByBookingId(bookingId: string): Promise<BookingFinancialRecords> {
		const key = String(bookingId ?? "").trim()
		if (!key) {
			return {
				paymentIntents: [],
				settlementRecords: [],
				refundRecords: [],
			}
		}
		const rows = await db
			.select({
				type: FinancialShadowRecord.type,
				payload: FinancialShadowRecord.payload,
			})
			.from(FinancialShadowRecord)
			.where(eq(FinancialShadowRecord.bookingId, key))
			.all()

		const paymentIntents: PaymentIntent[] = []
		const settlementRecords: SettlementRecord[] = []
		const refundRecords: RefundRecord[] = []

		for (const row of rows) {
			if (row.payload == null || typeof row.payload !== "object") continue
			if (row.type === "payment_intent") {
				paymentIntents.push(row.payload as PaymentIntent)
				continue
			}
			if (row.type === "settlement_record") {
				settlementRecords.push(row.payload as SettlementRecord)
				continue
			}
			if (row.type === "refund_record") {
				refundRecords.push(row.payload as RefundRecord)
			}
		}
		return {
			paymentIntents,
			settlementRecords,
			refundRecords,
		}
	}

	private async saveIfAbsent(params: {
		idempotencyKey: string
		bookingId: string
		type: "payment_intent" | "settlement_record" | "refund_record"
		payload: unknown
	}): Promise<"created" | "already_exists"> {
		const key = String(params.idempotencyKey ?? "").trim()
		const bookingId = String(params.bookingId ?? "").trim()
		if (!key || !bookingId) return "already_exists"

		const existing = await db
			.select({ id: FinancialShadowRecord.id })
			.from(FinancialShadowRecord)
			.where(eq(FinancialShadowRecord.idempotencyKey, key))
			.get()
		if (existing) return "already_exists"

		try {
			await db
				.insert(FinancialShadowRecord)
				.values({
					id: crypto.randomUUID(),
					bookingId,
					type: params.type,
					payload: params.payload as any,
					idempotencyKey: key,
					createdAt: new Date(),
				})
				.run()
			return "created"
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (message.includes("UNIQUE constraint failed")) {
				return "already_exists"
			}
			throw error
		}
	}
}
