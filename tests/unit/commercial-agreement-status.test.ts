import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", async (original) => ({
	...(await original<Record<string, unknown>>()),
	db: { transaction: mocks.transaction },
}))
import { commercialAgreementStatus } from "@/modules/financial/commercial-agreements"
import { createHash } from "node:crypto"

beforeEach(() => {
	vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "prepare")
	vi.stubEnv("FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE", "fixture-only")
	vi.stubEnv("FASTT_TOUR_AGREEMENT_PROVIDER_IDS", "provider-a")
	vi.useFakeTimers()
	vi.setSystemTime(new Date("2026-10-26T16:00:00Z"))
})
afterEach(() => {
	vi.unstubAllEnvs()
	vi.useRealTimers()
	vi.clearAllMocks()
})

describe("agreement status preserves the accepted contract beside its renewal", () => {
	it.each([
		["2026-01-01", "2026-12-31", "active"],
		["2025-01-01", "2025-12-31", "expired"],
		["2027-01-01", "2027-12-31", "not_started"],
	])(
		"reports accepted validity %s to %s independently from the pending proposal",
		async (effectiveFrom, effectiveTo, expected) => {
			const identityHash = createHash("sha256")
				.update(
					JSON.stringify({
						name: "Fixture",
						type: "persona_natural",
						country: "BO",
						taxCountry: "BO",
						declaration: "declared",
						taxNumber: "fixture-tax",
						taxStatus: "verified",
						verificationStatus: "approved",
					})
				)
				.digest("hex")
			const accepted = {
				id: "accepted",
				status: "accepted",
				acceptedAt: new Date("2026-01-01"),
				termsJson: { identityHash, effectiveFrom, effectiveTo },
			}
			const pending = { id: "pending", status: "offered" }
			const results = [
				[accepted],
				[pending],
				[{ legalName: "Fixture" }],
				[{ timezone: "America/La_Paz" }],
				[
					{
						holderType: "persona_natural",
						holderCountry: "BO",
						taxResidenceCountry: "BO",
						declarationStatus: "declared",
					},
				],
				[{ businessRegistrationNumber: "fixture-tax", status: "verified" }],
				[{ status: "approved" }],
				[{ collectionModel: "property_collect" }],
			]
			mocks.transaction.mockImplementation(async (callback) =>
				callback({
					select: () => {
						const result = results.shift()
						const query = {
							from: () => query,
							where: () => query,
							orderBy: () => query,
							limit: () => query,
							then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
						}
						return query
					},
				})
			)
			const result = await commercialAgreementStatus("provider-a")
			expect(result.state).toBe(expected === "active" ? "active" : "acceptance_required")
			expect("acceptedAgreement" in result && result.acceptedAgreement).toMatchObject({
				state: expected,
				agreement: { id: "accepted" },
			})
			expect(results).toHaveLength(0)
		}
	)
})
