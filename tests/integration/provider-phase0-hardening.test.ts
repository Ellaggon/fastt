import { describe, expect, it } from "vitest"
import { ProviderFinancialProfileRepository } from "@/modules/financial/infrastructure/repositories/ProviderFinancialProfileRepository"
import {
	decryptAccountIdentifier,
	encryptAccountIdentifier,
	readAccountIdentifierFromMetadata,
} from "@/lib/provider-payment-secrets"
import { upsertProvider } from "../test-support/catalog-db-test-data"

describe("phase 0 governance hardening helpers", () => {
	it("encrypts payout account identifiers without storing plaintext", () => {
		const plaintext = "ES9121000418450200051332"
		const enc = encryptAccountIdentifier(plaintext)
		expect(enc.ciphertext).toBeTruthy()
		expect(enc.iv).toBeTruthy()
		expect(enc.tag).toBeTruthy()
		expect(decryptAccountIdentifier(enc)).toBe(plaintext)

		const meta = {
			accountIdentifierEnc: enc,
			submissionNotes: "ok",
		}
		expect(readAccountIdentifierFromMetadata(meta)).toBe(plaintext)
		expect(readAccountIdentifierFromMetadata({ accountIdentifier: "LEGACY1234" })).toBe(
			"LEGACY1234"
		)
	})

	it("rejects FinancialProfile ready upsert without a verified payout account", async () => {
		const providerId = "provider_financial_ready_guard"
		await upsertProvider({
			id: providerId,
			legalName: "Ready Guard S.R.L.",
			displayName: "Ready Guard",
			ownerEmail: "ready.guard@example.com",
		})

		const repo = new ProviderFinancialProfileRepository()
		await expect(
			repo.upsert({
				providerId,
				payoutMethodReference: "••••0000",
				payoutSchedule: "weekly",
				currency: "USD",
				taxProfileStatus: "missing",
				status: "ready",
			})
		).rejects.toThrow("verified_payment_account_required")

		const incomplete = await repo.upsert({
			providerId,
			payoutMethodReference: null,
			payoutSchedule: "manual",
			currency: "USD",
			taxProfileStatus: "missing",
			status: "incomplete",
		})
		expect(incomplete.status).toBe("incomplete")
	})
})
