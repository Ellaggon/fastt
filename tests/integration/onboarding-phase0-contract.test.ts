import { describe, expect, it } from "vitest"
import contract from "../../docs/onboarding/phase-0-scenarios.json"
import {
	db,
	Provider,
	ProviderProfile,
	ProviderVerification,
	ProviderTaxConfiguration,
	ProviderDocument,
	ProviderPaymentAccount,
} from "@/shared/infrastructure/db/compat"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { providerIdentitySchema } from "@/schemas/provider"
import { upsertProvider } from "../test-support/catalog-db-test-data"

// Uses only the isolated database selected and fingerprint-checked by tests/setup.
// Unique fixture namespace avoids changing an existing user or provider.
const run = crypto.randomUUID()

describe("onboarding phase 0: documented capability contract", () => {
	it.each(contract.scenarios)("$id: missing=$missing", async (scenario) => {
		const providerId = `onboarding_p0_${run}_${scenario.id}`
		const email = `${providerId}@example.test`
		const userId = `user_${email}`
		if (scenario.missing === "team") {
			await db.insert(Provider).values({
				id: providerId,
				displayName: "Phase 0 fixture",
				legalName: "Phase 0 fixture",
				status: "draft",
				accountPurpose: "commercial",
				dataClassification: "fixture",
			})
		} else {
			await upsertProvider({
				id: providerId,
				displayName: "Phase 0 fixture",
				legalName: scenario.missing === "identity" ? " " : "Phase 0 fixture",
				ownerEmail: email,
			})
		}
		await db.insert(ProviderProfile).values({
			providerId,
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: scenario.missing === "operations" ? null : email,
		})
		await db.insert(ProviderVerification).values({
			id: `${providerId}_verification`,
			providerId,
			status: scenario.missing === "verification" ? "pending" : "approved",
		})
		await db.insert(ProviderTaxConfiguration).values({
			providerId,
			status: scenario.missing === "fiscality" ? "pending" : "verified",
			taxResidenceCountry: "BO",
			businessRegistrationNumber: "phase0-fixture",
		})
		// Include tax_document so the fiscal scenario only changes one prerequisite.
		await db.insert(ProviderDocument).values(
			["government_id", "business_registration", "tax_document"].map((type) => ({
				id: `${providerId}_${type}`,
				providerId,
				type,
				status: scenario.missing === "documents" ? "pending" : "verified",
			}))
		)
		await db.insert(ProviderPaymentAccount).values({
			id: `${providerId}_payment`,
			providerId,
			status: scenario.missing === "payments" ? "pending" : "verified",
			provider: "manual_bank",
			currency: "USD",
			accountReference: "phase0-fixture",
			payoutSchedule: "weekly",
		})
		const result = await evaluateProviderGovernance(providerId, {
			currentUserId: scenario.missing === "team" ? null : userId,
			persist: false,
		})
		expect(result.providerId).toBe(providerId)
		expect(result.capabilities).toMatchObject({
			publish: scenario.publish,
			booking: scenario.booking,
			payments: scenario.payments,
		})
		expect(result.blockers.map((item) => item.id)).toEqual(
			scenario.missing ? [scenario.missing] : []
		)
		// An absent connector is not a prerequisite for publish/booking/payments.
		expect(result.capabilities.integrations).toBe(false)
		expect(result.risks.map((item) => item.id)).toContain("integrations_not_ready")
	})

	it("keeps both business names mandatory in increment 1", () => {
		expect(providerIdentitySchema.safeParse({ displayName: "Tour operador" }).success).toBe(false)
		expect(
			providerIdentitySchema.safeParse({ displayName: "Tour operador", legalName: " " }).success
		).toBe(false)
		expect(
			providerIdentitySchema.safeParse({
				displayName: "Tour operador",
				legalName: "Titular válido",
			}).success
		).toBe(true)
	})
})
