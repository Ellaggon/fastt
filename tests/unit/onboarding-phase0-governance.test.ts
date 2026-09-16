import { beforeEach, describe, expect, it, vi } from "vitest"
import { getTableName } from "drizzle-orm"
import contract from "../../docs/onboarding/phase-0-scenarios.json"

const fixture = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }))

// Replace storage only: execute the production evaluator, document rules and
// permissions. This does not certify SQL, persistence or HTTP authorization.
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/shared/infrastructure/db/compat")>()
	return {
		...actual,
		db: {
			select() {
				let table = ""
				const query = {
					from(value: Parameters<typeof getTableName>[0]) {
						table = getTableName(value)
						return query
					},
					leftJoin() {
						return query
					},
					where() {
						return query
					},
					orderBy() {
						return query
					},
					limit() {
						return query
					},
					then(resolve: (rows: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
						return Promise.resolve(fixture.rows[table] ?? []).then(resolve, reject)
					},
				}
				return query
			},
		},
	}
})

import { evaluateProviderGovernance } from "@/lib/provider-governance"

beforeEach(() => {
	fixture.rows = {
		Provider: [
			{
				provider: { id: "phase0", displayName: "Negocio", legalName: "Titular", status: "draft" },
				profile: {
					timezone: "America/Santiago",
					defaultCurrency: "USD",
					supportEmail: "contact@example.test",
				},
			},
		],
		ProviderVerification: [{ status: "approved" }],
		ProviderTaxConfiguration: [
			{ status: "verified", taxResidenceCountry: "BO", businessRegistrationNumber: "fixture" },
		],
		ProviderDocument: ["government_id", "business_registration", "tax_document"].map((type) => ({
			type,
			status: "verified",
		})),
		ProviderPaymentAccount: [{ id: "payment", status: "verified" }],
		ProviderUser: [{ userId: "owner", role: "owner" }],
	}
})

describe("phase 0 documented snapshots against server evaluator", () => {
	it.each(contract.scenarios)("$id: $missing", async (scenario) => {
		const base = fixture.rows.Provider[0] as {
			provider: { legalName: string }
			profile: { supportEmail: string }
		}
		if (scenario.missing === "identity") base.provider.legalName = " "
		if (scenario.missing === "operations") base.profile.supportEmail = ""
		if (scenario.missing === "verification")
			fixture.rows.ProviderVerification = [{ status: "pending" }]
		if (scenario.missing === "fiscality")
			fixture.rows.ProviderTaxConfiguration = [{ status: "pending" }]
		if (scenario.missing === "documents") fixture.rows.ProviderDocument = []
		if (scenario.missing === "payments") fixture.rows.ProviderPaymentAccount = []
		if (scenario.missing === "team") fixture.rows.ProviderUser = []
		const result = await evaluateProviderGovernance("phase0", {
			currentUserId: "owner",
			persist: false,
		})
		expect(result.capabilities).toEqual({
			publish: scenario.publish,
			booking: scenario.booking,
			payments: scenario.payments,
			integrations: false,
		})
		expect(result.blockers.map((item) => item.id)).toEqual(
			scenario.missing ? [scenario.missing] : []
		)
	})

	it("does not confuse account capabilities with staff permissions", async () => {
		fixture.rows.ProviderUser.push({ userId: "staff", role: "staff" })
		const result = await evaluateProviderGovernance("phase0", { currentUserId: "staff" })
		expect(result.capabilities.payments).toBe(true)
		expect(result.permissions.canManagePayments).toBe(false)
	})

	it("fails for an absent provider instead of classifying it as ready", async () => {
		fixture.rows.Provider = []
		await expect(evaluateProviderGovernance("absent")).rejects.toThrow("PROVIDER_NOT_FOUND")
	})
})
