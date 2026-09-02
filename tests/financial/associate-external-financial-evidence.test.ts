import { describe, expect, it, vi } from "vitest"

import { associateExternalFinancialEvidence } from "@/modules/financial/application/use-cases/associate-external-financial-evidence"
import type { ExternalFinancialEvidenceAssociationRepositoryPort } from "@/modules/financial/application/ports/ExternalFinancialEvidenceAssociationRepositoryPort"

describe("associateExternalFinancialEvidence", () => {
	it("normalizes and delegates one explicit audited association", async () => {
		const repository: ExternalFinancialEvidenceAssociationRepositoryPort = {
			associate: vi.fn(async (input) => ({
				evidenceType: input.evidenceType,
				evidenceId: input.evidenceId,
				bookingId: input.bookingId,
				eventId: "event_1",
				idempotent: false,
			})),
		}
		const result = await associateExternalFinancialEvidence(
			{ repository },
			{
				providerId: " provider_1 ",
				evidenceType: "payment",
				evidenceId: " payment_1 ",
				bookingId: " booking_1 ",
				actorId: " user_1 ",
				reason: " Referencia verificada ",
			}
		)
		expect(repository.associate).toHaveBeenCalledWith({
			providerId: "provider_1",
			evidenceType: "payment",
			evidenceId: "payment_1",
			bookingId: "booking_1",
			actorId: "user_1",
			reason: "Referencia verificada",
		})
		expect(result.idempotent).toBe(false)
	})

	it("rejects associations without actor or reason before persistence", async () => {
		const repository: ExternalFinancialEvidenceAssociationRepositoryPort = {
			associate: vi.fn(),
		}
		await expect(
			associateExternalFinancialEvidence(
				{ repository },
				{
					providerId: "provider_1",
					evidenceType: "settlement",
					evidenceId: "settlement_1",
					bookingId: "booking_1",
					actorId: "",
					reason: "",
				}
			)
		).rejects.toThrow("FINANCIAL_EVIDENCE_ASSOCIATION_ACTOR_REQUIRED")
		expect(repository.associate).not.toHaveBeenCalled()
	})

	it("bounds the audit reason before persistence", async () => {
		const repository: ExternalFinancialEvidenceAssociationRepositoryPort = {
			associate: vi.fn(),
		}
		await expect(
			associateExternalFinancialEvidence(
				{ repository },
				{
					providerId: "provider_1",
					evidenceType: "payment",
					evidenceId: "payment_1",
					bookingId: "booking_1",
					actorId: "user_1",
					reason: "x".repeat(1001),
				}
			)
		).rejects.toThrow("FINANCIAL_EVIDENCE_ASSOCIATION_REASON_TOO_LONG")
		expect(repository.associate).not.toHaveBeenCalled()
	})
})
