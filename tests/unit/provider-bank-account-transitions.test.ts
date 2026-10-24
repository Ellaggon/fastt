import { beforeEach, describe, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
	row: {} as Record<string, any>,
	profile: null as Record<string, any> | null,
	others: [] as Record<string, any>[],
	tax: "verified",
	automatic: false,
	initiate: vi.fn(),
	confirm: vi.fn(),
	audit: vi.fn(),
	resolve: vi.fn(),
	assignment: vi.fn(),
	guard: vi.fn(),
}))
vi.mock("@/shared/infrastructure/db/client", () => ({
	postgresDb: {},
	withPostgresTransaction: async (work: () => Promise<unknown>) => {
		const snapshot = structuredClone({ row: state.row, profile: state.profile })
		try {
			return await work()
		} catch (error) {
			state.row = snapshot.row
			state.profile = snapshot.profile
			throw error
		}
	},
	afterPostgresCommit: async (effect: () => Promise<void>) => effect(),
}))
vi.mock("@/lib/provider-audit", () => ({
	writeProviderAuditLog: state.audit,
	inferSettingsRiskLevel: () => "high",
}))
vi.mock("@/lib/provider-compliance-ops", () => ({ completeComplianceAssignment: state.assignment }))
vi.mock("@/lib/casework/compliance-casework", () => ({
	synchronizeComplianceCaseCompat: vi.fn(),
	resolveComplianceCaseForSourceCompat: state.resolve,
	assertLegacyComplianceReviewAllowed: state.guard,
}))
vi.mock("@/lib/cache/invalidation", () => ({
	invalidateProvider: vi.fn(),
	invalidateProviderGovernance: vi.fn(),
}))
vi.mock("@/lib/provider-permissions", () => ({
	resolveProviderPermissions: () => ({ canManagePayments: true }),
}))
vi.mock("@/lib/payout-rail", () => ({
	canVerifyBankAccountAutomatically: () => state.automatic,
	initiatePayoutRailMicroDeposit: state.initiate,
	confirmStripeConnectMicroDeposit: state.confirm,
}))
vi.mock("@/shared/infrastructure/db/compat", async (original) => {
	const tables = await original<typeof import("@/shared/infrastructure/db/compat")>()
	return {
		...tables,
		db: {
			select: () => ({
				from: (table: unknown) => {
					const rows = () =>
						table === tables.Provider
							? [{ id: "provider-a" }]
							: table === tables.ProviderUser
								? [{ role: "owner", status: "active" }]
								: table === tables.ProviderTaxConfiguration
									? [{ status: state.tax }]
									: table === tables.ProviderFinancialProfile
										? state.profile
											? [state.profile]
											: []
										: [structuredClone(state.row), ...structuredClone(state.others)]
					const chain = {
						where: () => chain,
						for: () => chain,
						orderBy: () => chain,
						then: (fn: (value: unknown[]) => unknown) => Promise.resolve(rows()).then(fn),
					}
					return chain
				},
			}),
			update: (table: unknown) => ({
				set: (values: Record<string, unknown>) => ({
					where: async () => {
						if (table === tables.ProviderPaymentAccount) Object.assign(state.row, values)
						if (table === tables.ProviderFinancialProfile && state.profile)
							Object.assign(state.profile, values)
					},
				}),
			}),
			insert: () => ({
				values: (values: Record<string, unknown>) => ({
					onConflictDoUpdate: async () => {
						state.profile = { ...state.profile, ...values }
					},
				}),
			}),
		},
	}
})
import {
	confirmPaymentAccountMicroDeposit,
	initiatePaymentAccountMicroDeposit,
	reviewProviderPaymentAccount,
	selectPrimaryProviderPaymentAccount,
} from "@/lib/provider-payment-accounts"
const input = { providerId: "provider-a", actorUserId: "reviewer-a", accountId: "account-a" }
function bankChallenge() {
	state.automatic = true
	state.row.metadataJson = {
		payoutRail: { provider: "stripe_connect", mode: "live", externalRef: "seti_test" },
		microDeposit: {
			status: "initiated",
			verifyVia: "stripe",
			expiresAt: "2099-01-01",
			attempts: 0,
		},
	}
}
describe("bank account decision lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		state.row = {
			id: "account-a",
			providerId: "provider-a",
			status: "pending",
			provider: "bank_transfer",
			currency: "USD",
			country: "US",
			accountHolderName: "Proveedor",
			bankName: "Banco",
			accountReference: "••••1234",
			accountNumberLast4: "1234",
			routingOrSwift: "110000000",
			payoutSchedule: "manual",
			metadataJson: {},
			verifiedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		}
		state.profile = null
		state.others = []
		state.tax = "verified"
		state.automatic = false
		state.audit.mockResolvedValue(undefined)
		state.guard.mockResolvedValue(undefined)
	})
	it("requires evidence for manual approval before writing", async () => {
		await expect(reviewProviderPaymentAccount({ ...input, status: "verified" })).rejects.toThrow(
			"payment_review_evidence_required"
		)
		expect(state.row.status).toBe("pending")
	})
	it("commits masked approval, the exact beneficiary reference, case and assignment together", async () => {
		const result = await reviewProviderPaymentAccount({
			...input,
			status: "verified",
			reason: "Constancia bancaria y titularidad corroboradas.",
		})
		expect(result.accountIdentifier).toBeNull()
		expect(result.verificationMethod).toBe("manual")
		expect(state.profile?.payoutMethodReference).toBe("account-a")
		expect(state.resolve).toHaveBeenCalledWith(
			expect.objectContaining({ sourceRef: "account-a" }),
			"requirements_satisfied"
		)
		expect(state.assignment).toHaveBeenCalled()
	})
	it("does not mark the financial profile ready when fiscal review is missing", async () => {
		state.tax = "pending"
		await reviewProviderPaymentAccount({
			...input,
			status: "verified",
			reason: "Constancia bancaria revisada y titularidad corroborada.",
		})
		expect(state.profile?.status).toBe("incomplete")
	})
	it("clears financial readiness when a correction leaves no verified account", async () => {
		state.profile = {
			providerId: "provider-a",
			status: "ready",
			payoutMethodReference: "account-a",
		}
		await reviewProviderPaymentAccount({
			...input,
			status: "requires_attention",
			reason: "El respaldo no corresponde al titular de la cuenta.",
		})
		expect(state.row.status).toBe("requires_attention")
		expect(state.profile.status).toBe("incomplete")
	})
	it("keeps the selected beneficiary when another account is approved", async () => {
		state.others = [{ ...state.row, id: "account-primary", status: "verified" }]
		state.profile = {
			providerId: "provider-a",
			payoutMethodReference: "account-primary",
			currency: "USD",
		}
		await reviewProviderPaymentAccount({
			...input,
			status: "verified",
			reason: "Constancia bancaria revisada y titularidad corroborada.",
		})
		expect(state.profile.payoutMethodReference).toBe("account-primary")
	})
	it("requires an explicit selection to replace the primary account", async () => {
		state.row.status = "verified"
		state.profile = { payoutMethodReference: "other-account" }
		await selectPrimaryProviderPaymentAccount(input)
		expect(state.profile.payoutMethodReference).toBe("account-a")
	})
	it("rolls back account and profile if audit persistence fails", async () => {
		state.audit.mockRejectedValueOnce(new Error("audit_failed"))
		await expect(
			reviewProviderPaymentAccount({
				...input,
				status: "verified",
				reason: "Constancia bancaria revisada y titularidad corroborada.",
			})
		).rejects.toThrow("audit_failed")
		expect(state.row.status).toBe("pending")
		expect(state.profile).toBeNull()
	})
	it("does not resolve a casework decision from the legacy completion path", async () => {
		await reviewProviderPaymentAccount({
			...input,
			status: "verified",
			reason: "Titularidad y respaldo corroborados en el expediente.",
			manageCase: false,
		})
		expect(state.resolve).not.toHaveBeenCalled()
	})
	it("never starts a simulated verification on an actual account", async () => {
		await expect(initiatePaymentAccountMicroDeposit(input)).rejects.toThrow(
			"bank_verification_unavailable"
		)
		expect(state.initiate).not.toHaveBeenCalled()
		expect(state.row.status).toBe("pending")
	})
	it("does not accept simulated confirmations as verification", async () => {
		bankChallenge()
		state.row.metadataJson.payoutRail.mode = "simulated"
		await expect(
			confirmPaymentAccountMicroDeposit({ ...input, amount1Cents: 10, amount2Cents: 20 })
		).rejects.toThrow("bank_verification_unavailable")
		expect(state.confirm).not.toHaveBeenCalled()
	})
	it("keeps an existing challenge and its attempt count when initiation is repeated", async () => {
		state.automatic = true
		bankChallenge()
		await expect(initiatePaymentAccountMicroDeposit(input)).rejects.toThrow(
			"micro_deposit_review_required"
		)
		expect(state.initiate).not.toHaveBeenCalled()
	})
	it("completes an immediate bank result through the same lifecycle", async () => {
		state.automatic = true
		state.initiate.mockResolvedValueOnce({
			ok: true,
			mode: "live",
			provider: "stripe_connect",
			externalRef: "seti_test",
			alreadyVerified: true,
		})
		const result = await initiatePaymentAccountMicroDeposit(input)
		expect(result.account.status).toBe("verified")
		expect(result.account.accountIdentifier).toBeNull()
		expect(state.profile?.payoutMethodReference).toBe("account-a")
		expect(state.resolve).toHaveBeenCalled()
	})
	it("persists wrong amounts without rolling back the failed attempt", async () => {
		bankChallenge()
		state.confirm.mockResolvedValueOnce({ ok: false, error: "micro_deposit_mismatch" })
		await expect(
			confirmPaymentAccountMicroDeposit({ ...input, amount1Cents: 10, amount2Cents: 20 })
		).rejects.toThrow("micro_deposit_mismatch")
		expect(state.row.metadataJson.microDeposit.attempts).toBe(1)
		expect(state.row.status).toBe("pending")
	})
	it("does not consume attempts on an external outage", async () => {
		bankChallenge()
		state.confirm.mockRejectedValueOnce(new Error("timeout"))
		await expect(
			confirmPaymentAccountMicroDeposit({ ...input, amount1Cents: 10, amount2Cents: 20 })
		).rejects.toThrow("bank_verification_unavailable")
		expect(state.row.metadataJson.microDeposit.attempts).toBe(0)
		expect(state.row.metadataJson.microDeposit.confirmationToken).toBeTruthy()
	})
	it("closes the failed challenge after the final wrong attempt", async () => {
		bankChallenge()
		state.row.metadataJson.microDeposit.attempts = 2
		state.confirm.mockResolvedValueOnce({ ok: false, error: "micro_deposit_mismatch" })
		await expect(
			confirmPaymentAccountMicroDeposit({ ...input, amount1Cents: 10, amount2Cents: 20 })
		).rejects.toThrow("micro_deposit_failed")
		expect(state.row.status).toBe("requires_attention")
		expect(state.resolve).toHaveBeenCalled()
	})
	it("guards automatic confirmations against an outstanding case decision", async () => {
		bankChallenge()
		state.guard.mockRejectedValueOnce(new Error("casework_decision_pending"))
		await expect(
			confirmPaymentAccountMicroDeposit({ ...input, amount1Cents: 10, amount2Cents: 20 })
		).rejects.toThrow("casework_decision_pending")
		expect(state.confirm).not.toHaveBeenCalled()
	})
})
