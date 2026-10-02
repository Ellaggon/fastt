import { describe, expect, it } from "vitest"
import { presentExperienceDocument } from "@/lib/verification/document-list-presentation"
import type { ProviderDocumentRecord } from "@/lib/provider-documents"
import type { VerificationRequirement } from "@/lib/verification/requirement-resolver"
const requirement = {
	id: "tour.operator_license",
	layer: "tour",
	documentType: "operating_license",
} as VerificationRequirement
const scope = {
	id: "s",
	scopeType: "product" as const,
	productId: "a",
	resourceId: null,
	territoryCode: null,
	territoryLabel: null,
	activityClass: null,
}
const document = {
	id: "d",
	type: "operating_license",
	status: "verified",
	expiresAt: null,
	subjectType: "provider",
	subjectReference: null,
	scopes: [scope],
} as ProviderDocumentRecord
const present = (overrides: Partial<ProviderDocumentRecord> = {}) =>
	presentExperienceDocument({
		document: { ...document, ...overrides },
		requirements: [requirement],
		operation: { productId: "a", at: new Date("2026-10-02") },
		products: [
			{ id: "a", name: "Recorrido por La Paz" },
			{ id: "b", name: "Uyuni" },
		],
		resources: [],
	})
describe("document file and applicability separation", () => {
	it("does not present generic approved evidence as applicable", () => {
		expect(present({ scopes: [] })).toMatchObject({
			fileLabel: "Aprobado",
			applicability: "review_scope",
		})
	})
	it("identifies valid evidence and its product", () => {
		expect(present()).toMatchObject({
			applicabilityLabel: "Sirve para esta experiencia",
			scopeLabel: "Recorrido por La Paz",
		})
	})
	it("keeps another product and expired or replaced evidence as history", () => {
		expect(present({ scopes: [{ ...scope, productId: "b" }] })).toMatchObject({
			applicability: "history",
			scopeLabel: "Uyuni",
		})
		expect(present({ expiresAt: new Date("2025-01-01") })).toMatchObject({
			fileLabel: "Vencido",
			applicability: "history",
		})
		expect(present({ status: "superseded" })).toMatchObject({
			fileLabel: "Reemplazado",
			applicability: "history",
		})
	})
	it("matching pending and rejected files never enable the experience", () => {
		expect(present({ status: "pending" })).toMatchObject({
			fileLabel: "Enviado",
			applicabilityLabel: "Alcance coincidente · aún no habilita",
		})
		expect(present({ status: "rejected" })).toMatchObject({
			fileLabel: "Rechazado",
			applicabilityLabel: "Alcance coincidente · aún no habilita",
		})
	})
})
