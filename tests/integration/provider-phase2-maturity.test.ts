import { describe, expect, it } from "vitest"
import {
	db,
	eq,
	ProviderFinancialProfile,
	ProviderPaymentAccount,
	User,
} from "astro:db"
import {
	confirmPaymentAccountMicroDeposit,
	createProviderPaymentAccount,
	initiatePaymentAccountMicroDeposit,
} from "@/lib/provider-payment-accounts"
import { runConnectorSmokeTest } from "@/lib/provider-connector-smoke"
import { validateTaxpayerRegistrationNumber } from "@/lib/provider-tax-identity-validation"
import {
	upsertComplianceAssignment,
	listOpenComplianceAssignments,
	completeComplianceAssignment,
} from "@/lib/provider-compliance-ops"
import { upsertProvider } from "../test-support/catalog-db-test-data"

describe("P2 maturity — micro-deposit / smoke / TIN / ops SLA", () => {
	it("verifies payout ownership via micro-deposit confirm", async () => {
		const providerId = "provider_p2_micro_deposit"
		const ownerEmail = "p2.micro@example.com"
		const ownerId = `user_${ownerEmail}`
		const adminId = "user_p2_admin_micro"
		const now = new Date()

		await upsertProvider({
			id: providerId,
			legalName: "P2 Micro S.R.L.",
			displayName: "P2 Micro",
			ownerEmail,
		})
		await db.insert(User).values({
			id: adminId,
			email: "p2.admin.micro@fastt.test",
			username: "p2_admin_micro",
			registrationDate: now,
		})

		const account = await createProviderPaymentAccount({
			providerId,
			actorUserId: ownerId,
			method: "bank_transfer",
			currency: "USD",
			accountHolderName: "P2 Micro S.R.L.",
			bankName: "Banco Test",
			country: "BO",
			accountIdentifier: "998877665544",
			payoutSchedule: "weekly",
		})

		const initiated = await initiatePaymentAccountMicroDeposit({
			providerId,
			actorUserId: adminId,
			accountId: account.id,
		})
		expect(initiated.depositAmountsCents).toHaveLength(2)
		expect(initiated.account.microDeposit.status).toBe("initiated")

		await expect(
			confirmPaymentAccountMicroDeposit({
				providerId,
				actorUserId: ownerId,
				accountId: account.id,
				amount1Cents: 1,
				amount2Cents: 2,
			})
		).rejects.toThrow(/micro_deposit_mismatch/)

		const confirmed = await confirmPaymentAccountMicroDeposit({
			providerId,
			actorUserId: ownerId,
			accountId: account.id,
			amount1Cents: initiated.depositAmountsCents[0],
			amount2Cents: initiated.depositAmountsCents[1],
		})
		expect(confirmed.status).toBe("verified")
		expect(confirmed.microDeposit.status).toBe("confirmed")

		const persisted = await db
			.select({ status: ProviderPaymentAccount.status })
			.from(ProviderPaymentAccount)
			.where(eq(ProviderPaymentAccount.id, account.id))
			.get()
		expect(persisted?.status).toBe("verified")

		const financial = await db
			.select({ status: ProviderFinancialProfile.status })
			.from(ProviderFinancialProfile)
			.where(eq(ProviderFinancialProfile.providerId, providerId))
			.get()
		expect(financial?.status).toBe("ready")
	})

	it("runs connector smoke for vault and rejects opaque refs", async () => {
		const ok = await runConnectorSmokeTest({
			connectorKey: "channel_manager",
			credentialsRef: "vault://provider/channel-manager",
			mode: "sandbox",
		})
		expect(ok.ok).toBe(true)
		expect(ok.probe).toBe("vault")

		const harness = await runConnectorSmokeTest({
			connectorKey: "channel_manager",
			credentialsRef: "test://smoke-ok",
		})
		expect(harness.ok).toBe(true)
		expect(harness.probe).toBe("test_harness")

		const bad = await runConnectorSmokeTest({
			connectorKey: "channel_manager",
			credentialsRef: "plaintext-not-a-probe",
		})
		expect(bad.ok).toBe(false)
	})

	it("validates country TIN formats", () => {
		expect(
			validateTaxpayerRegistrationNumber({
				country: "CL",
				registrationNumber: "76.123.456-0",
				required: true,
			}).ok
		).toBe(true)
		expect(
			validateTaxpayerRegistrationNumber({
				country: "CL",
				registrationNumber: "76.123.456-7",
				required: true,
			}).ok
		).toBe(false)
		expect(
			validateTaxpayerRegistrationNumber({
				country: "US",
				registrationNumber: "12-3456789",
				required: true,
			}).normalized
		).toBe("12-3456789")
		expect(
			validateTaxpayerRegistrationNumber({
				country: "BO",
				registrationNumber: "1020304050",
				required: true,
			}).ok
		).toBe(true)
	})

	it("tracks ops assignments and completes on review close", async () => {
		const providerId = "provider_p2_ops_sla"
		const actorId = "user_p2_ops_actor"
		await upsertProvider({
			id: providerId,
			legalName: "P2 Ops S.R.L.",
			displayName: "P2 Ops",
			ownerEmail: "p2.ops@example.com",
		})
		await db.insert(User).values({
			id: actorId,
			email: "p2.ops.actor@fastt.test",
			username: "p2_ops_actor",
			registrationDate: new Date(),
		})

		const created = await upsertComplianceAssignment({
			providerId,
			domain: "payments",
			entityId: "acct_p2_ops",
			assigneeEmail: "ops@fastt.test",
			slaHours: 24,
			actorUserId: actorId,
		})
		expect(created?.status).toBe("open")
		expect(created?.assigneeEmail).toBe("ops@fastt.test")

		const open = await listOpenComplianceAssignments({ providerId })
		expect(open.some((row) => row.entityId === "acct_p2_ops")).toBe(true)

		await completeComplianceAssignment({
			providerId,
			domain: "payments",
			entityId: "acct_p2_ops",
		})
		const after = await listOpenComplianceAssignments({ providerId })
		expect(after.some((row) => row.entityId === "acct_p2_ops")).toBe(false)
	})
})
