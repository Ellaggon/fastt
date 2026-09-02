import {
	and,
	Booking,
	db,
	eq,
	FinancialReviewEvent,
	FinancialSettlementRecord,
	first,
	isNull,
	PaymentTransaction,
} from "@/shared/infrastructure/db/compat"

import type {
	AssociateExternalFinancialEvidenceInput,
	ExternalFinancialEvidenceAssociationRepositoryPort,
	ExternalFinancialEvidenceAssociationResult,
} from "../../application/ports/ExternalFinancialEvidenceAssociationRepositoryPort"

export class ExternalFinancialEvidenceAssociationRepository implements ExternalFinancialEvidenceAssociationRepositoryPort {
	constructor(private readonly database: Pick<typeof db, "transaction"> = db) {}

	async associate(
		input: AssociateExternalFinancialEvidenceInput
	): Promise<ExternalFinancialEvidenceAssociationResult> {
		return this.database.transaction(async (tx) => {
			const booking = await tx
				.select({ id: Booking.id })
				.from(Booking)
				.where(and(eq(Booking.id, input.bookingId), eq(Booking.providerId, input.providerId)))
				.for("share")
				.then(first)
			if (!booking) throw new Error("FINANCIAL_EVIDENCE_BOOKING_NOT_FOUND")

			const eventId = crypto.randomUUID()
			if (input.evidenceType === "payment") {
				const evidence = await tx
					.select({ id: PaymentTransaction.id, bookingId: PaymentTransaction.bookingId })
					.from(PaymentTransaction)
					.where(
						and(
							eq(PaymentTransaction.id, input.evidenceId),
							eq(PaymentTransaction.providerId, input.providerId)
						)
					)
					.for("update")
					.then(first)
				if (!evidence) throw new Error("FINANCIAL_EVIDENCE_NOT_FOUND")
				if (evidence.bookingId === input.bookingId) {
					return {
						evidenceType: input.evidenceType,
						evidenceId: evidence.id,
						bookingId: input.bookingId,
						eventId: null,
						idempotent: true,
					}
				}
				if (evidence.bookingId) throw new Error("FINANCIAL_EVIDENCE_ALREADY_ASSOCIATED")
				const updated = await tx
					.update(PaymentTransaction)
					.set({ bookingId: input.bookingId, updatedAt: new Date() })
					.where(
						and(
							eq(PaymentTransaction.id, input.evidenceId),
							eq(PaymentTransaction.providerId, input.providerId),
							isNull(PaymentTransaction.bookingId)
						)
					)
					.returning({ id: PaymentTransaction.id })
				if (updated.length !== 1) throw new Error("FINANCIAL_EVIDENCE_ASSOCIATION_CONFLICT")
				await tx.insert(FinancialReviewEvent).values({
					id: eventId,
					bookingId: input.bookingId,
					providerId: input.providerId,
					paymentTransactionId: input.evidenceId,
					type: "external_evidence_associated",
					actorId: input.actorId,
					actorType: "operator",
					payloadJson: { reason: input.reason, evidenceType: input.evidenceType },
				})
			} else {
				const evidence = await tx
					.select({
						id: FinancialSettlementRecord.id,
						bookingId: FinancialSettlementRecord.bookingId,
					})
					.from(FinancialSettlementRecord)
					.where(
						and(
							eq(FinancialSettlementRecord.id, input.evidenceId),
							eq(FinancialSettlementRecord.providerId, input.providerId)
						)
					)
					.for("update")
					.then(first)
				if (!evidence) throw new Error("FINANCIAL_EVIDENCE_NOT_FOUND")
				if (evidence.bookingId === input.bookingId) {
					return {
						evidenceType: input.evidenceType,
						evidenceId: evidence.id,
						bookingId: input.bookingId,
						eventId: null,
						idempotent: true,
					}
				}
				if (evidence.bookingId) throw new Error("FINANCIAL_EVIDENCE_ALREADY_ASSOCIATED")
				const updated = await tx
					.update(FinancialSettlementRecord)
					.set({ bookingId: input.bookingId, matchedAt: new Date() })
					.where(
						and(
							eq(FinancialSettlementRecord.id, input.evidenceId),
							eq(FinancialSettlementRecord.providerId, input.providerId),
							isNull(FinancialSettlementRecord.bookingId)
						)
					)
					.returning({ id: FinancialSettlementRecord.id })
				if (updated.length !== 1) throw new Error("FINANCIAL_EVIDENCE_ASSOCIATION_CONFLICT")
				await tx.insert(FinancialReviewEvent).values({
					id: eventId,
					bookingId: input.bookingId,
					providerId: input.providerId,
					settlementRecordId: input.evidenceId,
					type: "external_evidence_associated",
					actorId: input.actorId,
					actorType: "operator",
					payloadJson: { reason: input.reason, evidenceType: input.evidenceType },
				})
			}

			return {
				evidenceType: input.evidenceType,
				evidenceId: input.evidenceId,
				bookingId: input.bookingId,
				eventId,
				idempotent: false,
			}
		})
	}
}
