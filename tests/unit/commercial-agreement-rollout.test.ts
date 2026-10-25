import { afterEach, describe, expect, it, vi } from "vitest"
import {
	commercialAgreementRollout,
	revalidateTourAgreement,
} from "@/modules/financial/commercial-agreement-rollout"

const approved = {
	FASTT_TOUR_AGREEMENT_MODE: "enforce",
	FASTT_TOUR_AGREEMENT_PROVIDER_IDS: "provider-a, provider-b,provider-a",
	FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE: "review-fixture",
}
afterEach(() => vi.unstubAllEnvs())
describe("commercial agreement deployment gate", () => {
	it.each([
		{},
		{ ...approved, FASTT_TOUR_AGREEMENT_MODE: "true" },
		{ ...approved, FASTT_TOUR_AGREEMENT_MODE: "off" },
		{ ...approved, FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE: " " },
		{ ...approved, FASTT_TOUR_AGREEMENT_PROVIDER_IDS: "" },
		{ ...approved, FASTT_TOUR_AGREEMENT_PROVIDER_IDS: "*,provider-a" },
	])("keeps unapproved or malformed configuration off: %j", (env) => {
		expect(commercialAgreementRollout("provider-a", env)).toMatchObject({
			enabled: false,
			enforce: false,
		})
	})
	it("enforces only the explicit approved cohort", () => {
		expect(commercialAgreementRollout("provider-a", approved)).toMatchObject({
			enabled: true,
			enforce: true,
			providerIds: ["provider-a", "provider-b"],
		})
		expect(commercialAgreementRollout("provider-c", approved).enabled).toBe(false)
	})
	it("prepares agreements without enforcing publication or booking", () => {
		expect(
			commercialAgreementRollout("provider-a", {
				...approved,
				FASTT_TOUR_AGREEMENT_MODE: "prepare",
			})
		).toMatchObject({ enabled: true, enforce: false })
	})
	it("does not retroactively require agreements on legacy holds and supports rollback", () => {
		for (const [key, value] of Object.entries(approved)) vi.stubEnv(key, value)
		expect(revalidateTourAgreement("provider-a", false)).toBe(false)
		expect(revalidateTourAgreement("provider-a", true)).toBe(true)
		expect(revalidateTourAgreement("provider-c", true)).toBe(false)
		vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "off")
		expect(revalidateTourAgreement("provider-a", true)).toBe(false)
	})
})
