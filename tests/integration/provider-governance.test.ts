import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
	db,
	eq,
	ProviderConfigurationState,
	ProviderDocument,
	ProviderIntegrationConnection,
	ProviderPaymentAccount,
	ProviderProfile,
	ProviderTaxConfiguration,
	ProviderUser,
	ProviderVerification,
	TaxFeeDefinition,
	User,
} from "astro:db"
import {
	assertProviderCapability,
	evaluateProviderGovernance,
} from "@/lib/provider-governance"
import { upsertProvider } from "../test-support/catalog-db-test-data"

describe("integration/provider governance", () => {
	const previousEnforce = process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE

	beforeAll(() => {
		// P1-5: capability suites always enforce governance (no Vitest skip bypass).
		process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE = "1"
	})

	afterAll(() => {
		if (previousEnforce === undefined) delete process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE
		else process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE = previousEnforce
	})

	it("blocks provider capabilities when mandatory configuration is incomplete", async () => {
		const providerId = "provider_governance_blocked"
		const ownerEmail = "governance.blocked@example.com"
		const ownerId = `user_${ownerEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Gobernanza Pendiente S.R.L.",
			displayName: "Gobernanza Pendiente",
			ownerEmail,
		})

		const summary = await evaluateProviderGovernance(providerId, {
			currentUserId: ownerId,
			persist: true,
		})

		expect(summary.capabilities.publish).toBe(false)
		expect(summary.capabilities.booking).toBe(false)
		expect(summary.capabilities.payments).toBe(false)
		expect(summary.permissions.canEditProfile).toBe(true)
		expect(summary.blockers.map((blocker) => blocker.id)).toEqual(
			expect.arrayContaining(["operations", "verification", "fiscality", "payments"])
		)

		await expect(
			assertProviderCapability({
				providerId,
				currentUserId: ownerId,
				capability: "publish",
			})
		).rejects.toThrow("PROVIDER_CONFIGURATION_BLOCKED:publish")
	})

	it("unlocks capabilities and persists a configuration state when governance data is complete", async () => {
		const providerId = "provider_governance_ready"
		const ownerEmail = "governance.ready@example.com"
		const ownerId = `user_${ownerEmail}`
		const now = new Date("2026-07-18T12:00:00.000Z")

		await upsertProvider({
			id: providerId,
			legalName: "Gobernanza Lista S.R.L.",
			displayName: "Gobernanza Lista",
			ownerEmail,
		})
		await db.insert(ProviderProfile).values({
			providerId,
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: "soporte@gobernanza.test",
			supportPhone: "+59170000000",
			governanceUpdatedAt: now,
		})
		await db.insert(ProviderTaxConfiguration).values({
			providerId,
			status: "verified",
			taxResidenceCountry: "BO",
			businessRegistrationNumber: "1234567890",
			taxRegime: "general",
			invoicingMode: "platform_receipt",
			updatedAt: now,
			updatedBy: ownerId,
		})
		await db.insert(ProviderVerification).values({
			id: "verification_governance_ready",
			providerId,
			status: "approved",
			reason: "Cumplimiento aprobado",
			reviewedAt: now,
			createdAt: now,
		})
		await db.insert(ProviderDocument).values([
			{
				id: "document_governance_ready_gov",
				providerId,
				type: "government_id",
				status: "verified",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "document_governance_ready_biz",
				providerId,
				type: "business_registration",
				status: "verified",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "document_governance_ready_tax",
				providerId,
				type: "tax_document",
				status: "verified",
				createdAt: now,
				updatedAt: now,
			},
		])
		await db.insert(TaxFeeDefinition).values({
			id: "tax_governance_ready",
			providerId,
			code: "IVA",
			name: "IVA",
			kind: "tax",
			calculationType: "percentage",
			value: 13,
			currency: "USD",
			inclusionType: "excluded",
			appliesPer: "stay",
			status: "active",
			createdAt: now,
			updatedAt: now,
		})
		await db.insert(ProviderPaymentAccount).values({
			id: "payment_governance_ready",
			providerId,
			status: "verified",
			provider: "manual_bank",
			currency: "USD",
			accountReference: "acct_ready",
			payoutSchedule: "weekly",
			verifiedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		await db.insert(ProviderIntegrationConnection).values({
			id: "integration_governance_ready",
			providerId,
			connectorKey: "channel_manager",
			status: "connected",
			mode: "production",
			scopesJson: ["rates", "availability"],
			lastSyncAt: now,
			lastSyncStatus: "success",
			createdAt: now,
			updatedAt: now,
		})

		const summary = await assertProviderCapability({
			providerId,
			currentUserId: ownerId,
			capability: "publish",
		})

		expect(summary.capabilities).toEqual({
			publish: true,
			booking: true,
			payments: true,
			integrations: true,
		})
		expect(summary.counts).toMatchObject({
			documents: 3,
			verifiedDocuments: 3,
			paymentAccounts: 1,
			verifiedPaymentAccounts: 1,
			integrations: 1,
			connectedIntegrations: 1,
			teamMembers: 1,
		})

		const state = await db
			.select()
			.from(ProviderConfigurationState)
			.where(eq(ProviderConfigurationState.providerId, providerId))
			.get()
		expect(state?.canPublish).toBe(true)
		expect(state?.canAcceptBookings).toBe(true)
		expect(state?.canCollectPayments).toBe(true)
		expect(state?.canUseIntegrations).toBe(true)
	})

	it("keeps roles simple while honoring granular permission overrides", async () => {
		const providerId = "provider_governance_permission_overrides"
		const ownerEmail = "permission.owner@example.com"
		const staffEmail = "permission.staff@example.com"
		const staffId = `user_${staffEmail}`

		await upsertProvider({
			id: providerId,
			legalName: "Permisos Granulares S.R.L.",
			displayName: "Permisos Granulares",
			ownerEmail,
		})
		await db.insert(User).values({ id: staffId, email: staffEmail }).onConflictDoNothing()
		await db.insert(ProviderUser).values({
			id: "provider_user_permission_override",
			providerId,
			userId: staffId,
			role: "staff",
			permissionsJson: {
				canEditProfile: true,
				canManageFiscality: false,
				canManagePayments: false,
				canManageIntegrations: false,
				canInviteTeam: true,
			},
		})

		const summary = await evaluateProviderGovernance(providerId, {
			currentUserId: staffId,
		})

		expect(summary.permissions).toMatchObject({
			canEditProfile: true,
			canManageFiscality: false,
			canManagePayments: false,
			canManageIntegrations: false,
			canInviteTeam: true,
		})
	})

	it("does not treat verification approval or tax-fee shortcuts as documents/fiscal complete", async () => {
		const providerId = "provider_governance_no_bypass"
		const ownerEmail = "governance.nobypass@example.com"
		const ownerId = `user_${ownerEmail}`
		const now = new Date("2026-07-21T12:00:00.000Z")

		await upsertProvider({
			id: providerId,
			legalName: "Sin Atajos S.R.L.",
			displayName: "Sin Atajos",
			ownerEmail,
		})
		await db.insert(ProviderProfile).values({
			providerId,
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: "soporte@sinatajos.test",
			governanceUpdatedAt: now,
		})
		await db.insert(ProviderVerification).values({
			id: "verification_governance_no_bypass",
			providerId,
			status: "approved",
			createdAt: now,
		})
		await db.insert(ProviderTaxConfiguration).values({
			providerId,
			status: "pending",
			taxResidenceCountry: "CL",
			businessRegistrationNumber: "76.111.222-8",
			taxRegime: "general",
			invoicingMode: "platform_receipt",
			updatedAt: now,
			updatedBy: ownerId,
		})
		await db.insert(TaxFeeDefinition).values({
			id: "tax_governance_no_bypass",
			providerId,
			code: "IVA",
			name: "IVA",
			kind: "tax",
			calculationType: "percentage",
			value: 19,
			currency: "USD",
			inclusionType: "excluded",
			appliesPer: "stay",
			status: "active",
			createdAt: now,
			updatedAt: now,
		})
		await db.insert(ProviderDocument).values({
			id: "document_governance_no_bypass_pending",
			providerId,
			type: "business_registration",
			status: "pending",
			createdAt: now,
			updatedAt: now,
		})
		await db.insert(ProviderPaymentAccount).values({
			id: "payment_governance_no_bypass",
			providerId,
			status: "verified",
			provider: "bank_transfer",
			currency: "USD",
			accountReference: "••••9999",
			payoutSchedule: "weekly",
			verifiedAt: now,
			createdAt: now,
			updatedAt: now,
		})

		const summary = await evaluateProviderGovernance(providerId, {
			currentUserId: ownerId,
		})

		const byId = Object.fromEntries(summary.readiness.map((item) => [item.id, item.complete]))
		expect(byId.verification).toBe(true)
		expect(byId.documents).toBe(false)
		expect(byId.fiscality).toBe(false)
		expect(byId.payments).toBe(true)
		expect(summary.capabilities.publish).toBe(false)
		expect(summary.capabilities.payments).toBe(false)
		expect(summary.risks.map((risk) => risk.id)).toContain("fiscal_pending_verification")
		expect(summary.risks.map((risk) => risk.id)).toContain("documents_pending_review")
		expect(summary.risks.map((risk) => risk.id)).toContain("documents_kyc_set_incomplete")
		// Active tax fees exist — should NOT complete fiscality, and missing-fees risk should be absent.
		expect(summary.risks.map((risk) => risk.id)).not.toContain("tax_definitions_missing")
	})

	it("does not mark integrations ready until a successful smoke sync exists", async () => {
		const providerId = "provider_governance_smoke"
		const ownerEmail = "governance.smoke@example.com"
		const ownerId = `user_${ownerEmail}`
		const now = new Date("2026-07-21T13:00:00.000Z")

		await upsertProvider({
			id: providerId,
			legalName: "Smoke Test S.R.L.",
			displayName: "Smoke Test",
			ownerEmail,
		})
		await db.insert(ProviderIntegrationConnection).values({
			id: "integration_governance_smoke_pending",
			providerId,
			connectorKey: "webhooks_api",
			status: "pending",
			mode: "sandbox",
			scopesJson: ["webhooks:deliver"],
			credentialsRef: "vault://secret/webhooks",
			createdAt: now,
			updatedAt: now,
		})

		const beforeSmoke = await evaluateProviderGovernance(providerId, {
			currentUserId: ownerId,
		})
		expect(beforeSmoke.readiness.find((item) => item.id === "integrations")?.complete).toBe(false)
		expect(beforeSmoke.counts.connectedIntegrations).toBe(0)
		expect(beforeSmoke.risks.map((risk) => risk.id)).toContain("integrations_smoke_pending")

		await db
			.update(ProviderIntegrationConnection)
			.set({ status: "connected", lastSyncStatus: "success", lastSyncAt: now })
			.where(eq(ProviderIntegrationConnection.id, "integration_governance_smoke_pending"))

		const afterSmoke = await evaluateProviderGovernance(providerId, {
			currentUserId: ownerId,
		})
		expect(afterSmoke.readiness.find((item) => item.id === "integrations")?.complete).toBe(true)
		expect(afterSmoke.counts.connectedIntegrations).toBe(1)
	})
})
