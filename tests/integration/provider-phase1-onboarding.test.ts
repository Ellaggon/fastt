import { describe, expect, it } from "vitest"
import {
	evaluateRequiredKycDocumentsComplete,
	requiredKycDocumentTypes,
} from "@/lib/provider-documents"
import {
	allowLegacyLocalDocumentUrls,
	assertAllowedProviderDocumentUrl,
	buildProviderDocumentObjectKey,
	parseProviderDocumentObjectKey,
	toProviderDocumentFileRef,
} from "@/lib/provider-document-storage"
import { loadProviderComplianceDetail } from "@/lib/provider-admin-compliance"
import { evaluateProviderGovernance } from "@/lib/provider-governance"
import { db, ProviderDocument, ProviderProfile, ProviderVerification } from "astro:db"
import { upsertProvider } from "../test-support/catalog-db-test-data"

describe("phase 1 onboarding parity", () => {
	it("requires the full KYC document set for documentsComplete", async () => {
		expect(
			evaluateRequiredKycDocumentsComplete([
				{ type: "business_registration", status: "verified" },
			]).complete
		).toBe(false)
		expect(
			evaluateRequiredKycDocumentsComplete(
				requiredKycDocumentTypes.map((type) => ({ type, status: "verified" }))
			).complete
		).toBe(true)

		const providerId = "provider_phase1_kyc_set"
		const ownerEmail = "phase1.kyc@example.com"
		const ownerId = `user_${ownerEmail}`
		const now = new Date()

		await upsertProvider({
			id: providerId,
			legalName: "KYC Set S.R.L.",
			displayName: "KYC Set",
			ownerEmail,
		})
		await db.insert(ProviderProfile).values({
			providerId,
			timezone: "America/Santiago",
			defaultCurrency: "USD",
			supportEmail: "soporte@kyc.test",
			governanceUpdatedAt: now,
		})
		await db.insert(ProviderVerification).values({
			id: "verification_phase1_kyc",
			providerId,
			status: "approved",
			createdAt: now,
		})
		await db.insert(ProviderDocument).values({
			id: "doc_phase1_only_biz",
			providerId,
			type: "business_registration",
			status: "verified",
			createdAt: now,
			updatedAt: now,
		})

		const summary = await evaluateProviderGovernance(providerId, { currentUserId: ownerId })
		expect(summary.readiness.find((item) => item.id === "documents")?.complete).toBe(false)
		expect(summary.risks.map((risk) => risk.id)).toContain("documents_kyc_set_incomplete")
	})

	it("builds private r2 document refs and rejects local urls when R2 is configured", () => {
		const key = buildProviderDocumentObjectKey({
			providerId: "prov_1",
			documentId: "doc_1",
			fileName: "NIT 2026.pdf",
		})
		expect(key).toContain("provider-documents/prov_1/doc_1/")
		const ref = toProviderDocumentFileRef(key)
		expect(ref.startsWith("r2:")).toBe(true)
		expect(parseProviderDocumentObjectKey(ref)).toBe(key)

		const prevBucket = process.env.R2_BUCKET_NAME
		const prevAccount = process.env.R2_ACCOUNT_ID
		const prevAccess = process.env.R2_ACCESS_KEY_ID
		const prevSecret = process.env.R2_SECRET_ACCESS_KEY
		const prevVitest = process.env.VITEST
		try {
			process.env.R2_BUCKET_NAME = "bucket"
			process.env.R2_ACCOUNT_ID = "acct"
			process.env.R2_ACCESS_KEY_ID = "key"
			process.env.R2_SECRET_ACCESS_KEY = "secret"
			delete process.env.VITEST
			expect(allowLegacyLocalDocumentUrls()).toBe(false)
			expect(() => assertAllowedProviderDocumentUrl("local://x")).toThrow(
				"local_document_url_not_allowed"
			)
			expect(() => assertAllowedProviderDocumentUrl(ref)).not.toThrow()
		} finally {
			if (prevBucket === undefined) delete process.env.R2_BUCKET_NAME
			else process.env.R2_BUCKET_NAME = prevBucket
			if (prevAccount === undefined) delete process.env.R2_ACCOUNT_ID
			else process.env.R2_ACCOUNT_ID = prevAccount
			if (prevAccess === undefined) delete process.env.R2_ACCESS_KEY_ID
			else process.env.R2_ACCESS_KEY_ID = prevAccess
			if (prevSecret === undefined) delete process.env.R2_SECRET_ACCESS_KEY
			else process.env.R2_SECRET_ACCESS_KEY = prevSecret
			if (prevVitest === undefined) delete process.env.VITEST
			else process.env.VITEST = prevVitest
		}
	})

	it("loads an admin 360 compliance detail for a provider", async () => {
		const providerId = "provider_phase1_admin360"
		await upsertProvider({
			id: providerId,
			legalName: "Admin 360 S.R.L.",
			displayName: "Admin 360",
			ownerEmail: "admin360@example.com",
		})
		const detail = await loadProviderComplianceDetail(providerId)
		expect(detail?.provider.id).toBe(providerId)
		expect(detail?.rejectTemplates.length).toBeGreaterThan(0)
		expect(detail?.checklist.map((item) => item.id)).toEqual(
			expect.arrayContaining(["verification", "fiscal", "documents", "payments"])
		)
	})
})
