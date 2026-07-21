import { describe, expect, it } from "vitest"
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
	it("blocks provider capabilities when mandatory configuration is incomplete", async () => {
		const previousEnforce = process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE
		process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE = "1"
		try {
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
		} finally {
			if (previousEnforce === undefined) delete process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE
			else process.env.FASTT_ENFORCE_PROVIDER_GOVERNANCE = previousEnforce
		}
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
			businessRegistrationNumber: "NIT-123456",
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
		await db.insert(ProviderDocument).values({
			id: "document_governance_ready",
			providerId,
			type: "business_registration",
			status: "verified",
			createdAt: now,
			updatedAt: now,
		})
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
			lastSyncStatus: "ok",
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
			documents: 1,
			verifiedDocuments: 1,
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
})
