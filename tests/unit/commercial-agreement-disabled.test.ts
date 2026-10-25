import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), lines: vi.fn() }))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	db: { select: mocks.select, transaction: mocks.transaction },
}))
vi.mock("@/lib/verification/commercial-lines", () => ({ listProviderCommercialLines: mocks.lines }))
import {
	listCommercialAgreements,
	commercialAgreementStatus,
	requestCommercialAgreement,
	offerCommercialAgreement,
	acceptCommercialAgreement,
	withdrawCommercialAgreement,
	requestCommercialAgreementCorrection,
} from "@/modules/financial/commercial-agreements"
import { loadAdminAgreementSurface } from "@/lib/commercial-policy/admin-agreement-surface"
beforeEach(() => {
	vi.clearAllMocks()
	vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "off")
	mocks.select.mockImplementation(() => {
		throw new Error("new schema must not be read")
	})
	mocks.transaction.mockImplementation(() => {
		throw new Error("new schema must not be used")
	})
})
afterEach(() => vi.unstubAllEnvs())
describe("disabled agreement release without its physical table", () => {
	it("returns no agreement surface without accessing the database", async () => {
		expect(await listCommercialAgreements("provider-a")).toEqual([])
		expect(await commercialAgreementStatus("provider-a")).toEqual({
			state: "disabled",
			agreement: null,
		})
		expect(await loadAdminAgreementSurface("provider-a")).toBeNull()
		expect(mocks.select).not.toHaveBeenCalled()
		expect(mocks.transaction).not.toHaveBeenCalled()
		expect(mocks.lines).not.toHaveBeenCalled()
	})
	it("rejects every command before entering a transaction", async () => {
		const commands = [
			() => requestCommercialAgreement("provider-a", "user"),
			() =>
				offerCommercialAgreement({
					providerId: "provider-a",
					agreementId: "id",
					actorUserId: "user",
					signerUserId: "signer",
					representationReference: "fixture",
					terms: {},
				}),
			() =>
				acceptCommercialAgreement({
					providerId: "provider-a",
					userId: "user",
					agreementId: "id",
					termsHash: "hash",
					consent: true,
				}),
			() => withdrawCommercialAgreement("provider-a", "id", "user"),
			() => requestCommercialAgreementCorrection("provider-a", "id", "user", "fixture correction"),
		]
		for (const command of commands)
			await expect(command()).rejects.toMatchObject({
				code: "commercial_agreements_disabled",
				status: 404,
			})
		expect(mocks.transaction).not.toHaveBeenCalled()
	})
})
