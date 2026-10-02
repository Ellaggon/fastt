import { describe, expect, it } from "vitest"

import {
	documentAppliesToOperation,
	isProviderDocumentExpired,
	parseProviderDocumentEvidence,
	validateProviderDocumentEvidence,
	type ProviderDocumentRecord,
} from "@/lib/provider-documents"
import { parseTourComplianceContext, storedTourActivityClasses } from "@/lib/tours/tour-compliance-context"

function evidence(overrides: Partial<ProviderDocumentRecord> = {}): ProviderDocumentRecord {
	return {
		id: "document-1",
		providerId: "provider-1",
		type: "operating_license",
		typeLabel: "Licencia de operación",
		status: "verified",
		statusLabel: "Verificado",
		tone: "success",
		fileUrl: "local://provider-documents/provider-1/document-1/licencia.pdf",
		fileName: "licencia.pdf",
		mimeType: "application/pdf",
		sizeBytes: 123,
		submissionNotes: null,
		issuer: "Autoridad turística",
		issuedAt: new Date("2026-01-01T00:00:00Z"),
		expiresAt: new Date("2026-12-31T00:00:00Z"),
		subjectType: "provider",
		subjectReference: null,
		scopes: [],
		reviewNotes: null,
		reviewedAt: null,
		reviewedBy: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}
}

describe("provider document evidence scope", () => {
	it("rejects a licence or insurance that names no product, person, territory or activity", () => {
		expect(() =>
			parseProviderDocumentEvidence({
				issuer: "Gobernación",
				expiresAt: "2026-12-31",
				subjectType: "provider",
				requireOperationScope: true,
			})
		).toThrow("document_scope_required")
		expect(
			parseProviderDocumentEvidence({
				issuer: "Gobernación",
				expiresAt: "2026-12-31",
				subjectType: "person",
				territories: [{ code: "BO-LP", label: "La Paz" }],
				requireOperationScope: true,
			}).territories
		).toEqual([{ code: "BO-LP", label: "La Paz" }])
	})

	it("enforces the product and checked-subject contract before storage", () => {
		expect(() =>
			validateProviderDocumentEvidence(
				{ subjectType: "provider", territories: [{ code: "BO-LP", label: "La Paz" }] },
				{ requireProductScope: true }
			)
		).toThrow("document_product_scope_required")
		expect(() =>
			validateProviderDocumentEvidence(
				{ productIds: ["tour-a"], subjectType: "provider" },
				{
					requireProductScope: true,
					requireSubjectReference: true,
					allowedSubjectTypes: ["person", "resource"],
				}
			)
		).toThrow("document_subject_reference_required")
		expect(
			validateProviderDocumentEvidence(
				{
					productIds: ["tour-a"],
					subjectType: "person",
					subjectReference: "guide-ana",
				},
				{
					requireProductScope: true,
					requireSubjectReference: true,
					allowedSubjectTypes: ["person", "resource"],
				}
			)
		).toMatchObject({ productIds: ["tour-a"], subjectReference: "guide-ana" })
	})

	it("records a licence scope without treating another licence as a replacement", () => {
		const parsed = parseProviderDocumentEvidence({
			issuer: "Gobernación",
			expiresAt: "2026-12-31",
			subjectType: "legal_entity",
			productIds: ["tour-a"],
			territories: [{ code: "BO-LP", label: "La Paz" }],
			activityClasses: ["guided_nature"],
		})
		expect(parsed.productIds).toEqual(["tour-a"])
		expect(parsed.territories).toEqual([{ code: "BO-LP", label: "La Paz" }])
		expect(parsed.activityClasses).toEqual(["guided_nature"])
	})

	it("does not apply a scoped or expired evidence outside its real coverage", () => {
		const licence = evidence({
			scopes: [
				{ id: "scope-product", scopeType: "product", productId: "tour-a", resourceId: null, territoryCode: null, territoryLabel: null, activityClass: null },
				{ id: "scope-territory", scopeType: "territory", productId: null, resourceId: null, territoryCode: "BO-LP", territoryLabel: "La Paz", activityClass: null },
				{ id: "scope-activity", scopeType: "activity", productId: null, resourceId: null, territoryCode: null, territoryLabel: null, activityClass: "guided_nature" },
			],
		})
		expect(documentAppliesToOperation(licence, { productId: "tour-a", territoryCodes: ["BO-LP"], activityClasses: ["guided_nature"] })).toBe(true)
		expect(documentAppliesToOperation(licence, { productId: "tour-b", territoryCodes: ["BO-LP"], activityClasses: ["guided_nature"] })).toBe(false)
		expect(documentAppliesToOperation(licence, { productId: "tour-a", territoryCodes: ["BO-LP"], activityClasses: ["adventure"] })).toBe(false)
		expect(documentAppliesToOperation(licence, { at: new Date("2027-01-01T00:00:00Z"), productId: "tour-a", territoryCodes: ["BO-LP"], activityClasses: ["guided_nature"] })).toBe(false)
	})

	it("keeps the operational declaration explicit and rejects unsupported activity classes", () => {
		expect(parseTourComplianceContext({ operatingRole: "operator", activityClasses: ["transport", "adventure"], jurisdictionCode: "BO-LP" })).toMatchObject({ operatingRole: "operator", activityClasses: ["transport", "adventure"], jurisdictionCode: "BO-LP" })
		expect(() => parseTourComplianceContext({ activityClasses: ["hotel_pool"] })).toThrow("invalid_tour_activity_class")
	})

	it.each(["BO-LP", "BO-CB", "BO-SC", "BO-PT"])("accepts the catalog territory %s without translating its code", (code) => {
		expect(parseTourComplianceContext({ jurisdictionCode: code }).jurisdictionCode).toBe(code)
	})

	it.each(["La Paz", "LP", "BO-unknown", "BO-LP,BO-SC"])("rejects unrecognized territory %s instead of guessing", (code) => {
		expect(() => parseTourComplianceContext({ jurisdictionCode: code })).toThrow("invalid_tour_jurisdiction")
	})

	it("restores previously saved activity declarations, including legacy JSON text", () => {
		expect(storedTourActivityClasses(["adventure", "transport", "adventure"])).toEqual(["adventure", "transport"])
		expect(storedTourActivityClasses('["guided_nature","water_air"]')).toEqual(["guided_nature", "water_air"])
		expect(storedTourActivityClasses('["hotel_pool"]')).toEqual([])
	})

	it("treats an expiry as a civil date across the whole end date", () => {
		const expiry = new Date("2026-09-26T23:59:59.999Z")
		expect(isProviderDocumentExpired(expiry, new Date("2026-09-26T12:00:00Z"))).toBe(false)
		expect(isProviderDocumentExpired(expiry, new Date("2026-09-27T00:00:00Z"))).toBe(true)
		expect(
			documentAppliesToOperation(evidence({ expiresAt: expiry }), {
				at: new Date("2026-09-26T12:00:00Z"),
			})
		).toBe(true)
	})
})
