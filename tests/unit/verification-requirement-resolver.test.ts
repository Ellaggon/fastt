import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	requiredKycDocumentTypes,
	evaluateRequiredKycDocumentsComplete,
} from "@/lib/provider-documents"
import { governanceCheckIdsFor } from "@/lib/verification/governance-capabilities"
import {
	accountGateDocumentTypes,
	matchUpload,
	packDocumentTypes,
	packUploadOptions,
	requestedTypeRoutesToPack,
	resolveVerificationRequirements,
	type TourVerificationContext,
	type VerificationResolutionInput,
} from "@/lib/verification/requirement-resolver"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

function guideTour(overrides: Partial<TourVerificationContext> = {}): TourVerificationContext {
	return {
		productId: "tour-lp",
		operatingRole: "guide",
		activityClasses: ["urban_cultural"],
		jurisdictionCode: "BO-LP",
		departureResourceIds: ["guide-ana"],
		...overrides,
	}
}

function input(overrides: Partial<VerificationResolutionInput> = {}): VerificationResolutionInput {
	return {
		lines: ["tour"],
		holderType: "persona_natural",
		holderCountry: "BO",
		taxResidenceCountry: null,
		collectionModel: "property_collect",
		tours: [guideTour()],
		...overrides,
	}
}

function ids(overrides?: Partial<VerificationResolutionInput>) {
	return resolveVerificationRequirements(input(overrides)).requirements.map((item) => item.id)
}

describe("verification requirement resolver", () => {
	it("asks a tour guide for identity once and never for lodging evidence", () => {
		const resolution = resolveVerificationRequirements(input())
		expect(ids()).toEqual([
			"shared.legal_name",
			"shared.government_id",
			"shared.tax_document",
			"tour.guide_credential",
		])
		expect(packDocumentTypes(resolution)).toEqual(["operating_license"])
		expect(packUploadOptions(resolution).map((item) => item.label)).toEqual(["Credencial de guía"])
		expect(packUploadOptions(resolution).map((item) => item.value)).toEqual([
			"operating_license::tour.guide_credential",
		])
		expect(requestedTypeRoutesToPack(resolution, "ownership_proof")).toBe(false)
		expect(requestedTypeRoutesToPack(resolution, "operating_license")).toBe(true)
		expect(matchUpload(resolution, "ownership_proof")).toBeNull()
		expect(matchUpload(resolution, "operating_license::lodging.establishment_license")).toBeNull()
		expect(matchUpload(resolution, "operating_license::tour.guide_credential")?.id).toBe(
			"tour.guide_credential"
		)

		const credential = resolution.requirements.find((item) => item.id === "tour.guide_credential")
		expect(credential?.scopes).toEqual({
			productIds: ["tour-lp"],
			territoryCodes: ["BO-LP"],
			activityClasses: ["urban_cultural"],
			resourceIds: ["guide-ana"],
		})
		expect(accountGateDocumentTypes(resolution)).toEqual(["government_id", "tax_document"])
	})

	it("adds insurance only for adventure, transport or water and air", () => {
		const urban = resolveVerificationRequirements(input())
		expect(urban.requirements.some((item) => item.id === "tour.insurance")).toBe(false)

		const adventure = resolveVerificationRequirements(
			input({
				tours: [guideTour({ activityClasses: ["adventure"], productId: "raft" })],
			})
		)
		const insurance = adventure.requirements.find((item) => item.id === "tour.insurance")
		expect(insurance?.documentType).toBe("insurance")
		expect(insurance?.scopes.productIds).toEqual(["raft"])
		expect(
			adventure.requirements.filter((item) => item.id === "shared.government_id")
		).toHaveLength(1)
	})

	it("treats an intermediary as an operator without asking for a guide credential", () => {
		const resolution = resolveVerificationRequirements(
			input({
				tours: [
					guideTour({
						productId: "tour-intermediary",
						operatingRole: "intermediary",
						activityClasses: ["urban_cultural"],
						departureResourceIds: [],
					}),
				],
			})
		)
		const requirementIds = resolution.requirements.map((item) => item.id)
		expect(requirementIds).toContain("tour.operator_license")
		expect(requirementIds).not.toContain("tour.guide_credential")
		expect(requirementIds).not.toContain("tour.insurance")
		expect(requirementIds).not.toContain("shared.address_proof")
		expect(packUploadOptions(resolution).map((item) => item.label)).toContain(
			"Habilitación de operador o intermediario"
		)
	})

	it("does not ask every tour document when the experience is still undeclared", () => {
		const empty = resolveVerificationRequirements(input({ tours: [] }))
		expect(ids({ tours: [] })).toEqual([
			"shared.legal_name",
			"shared.government_id",
			"shared.tax_document",
			"tour.context_missing",
		])
		expect(packUploadOptions(empty)).toEqual([])

		const gastronomic = resolveVerificationRequirements(
			input({
				tours: [guideTour({ activityClasses: ["gastronomic"], operatingRole: null })],
			})
		)
		expect(gastronomic.requirements.some((item) => item.id === "tour.insurance")).toBe(false)
		expect(
			gastronomic.requirements.find((item) => item.id === "tour.food_handling_pending")
				?.documentType
		).toBe(null)
	})

	it("blocks an incomplete activity or territory instead of inferring a licence pack", () => {
		const incomplete = resolveVerificationRequirements(
			input({
				tours: [guideTour({ activityClasses: [], jurisdictionCode: null })],
			})
		)
		expect(incomplete.requirements.map((item) => item.id)).toContain("tour.context_missing")
		expect(incomplete.requirements.map((item) => item.id)).not.toContain("tour.insurance")
	})

	it("asks entity registration once and reuses it when both lines are enrolled", () => {
		const resolution = resolveVerificationRequirements(
			input({
				lines: ["lodging", "tour"],
				holderType: "entidad",
				collectionModel: "platform_collect",
				tours: [
					guideTour(),
					guideTour({
						productId: "tour-operator",
						operatingRole: "operator",
						activityClasses: ["transport"],
						jurisdictionCode: "BO-CB",
						departureResourceIds: ["van-1"],
					}),
				],
			})
		)
		const sharedIds = resolution.requirements
			.filter((item) => item.layer === "shared")
			.map((item) => item.id)
		expect(sharedIds).toEqual([
			"shared.legal_name",
			"shared.government_id",
			"shared.business_registration",
			"shared.tax_document",
			"shared.address_proof",
		])
		expect(
			resolution.requirements.filter((item) => item.id === "shared.business_registration")
		).toHaveLength(1)
		expect(
			resolution.requirements.filter((item) => item.id === "shared.tax_document")
		).toHaveLength(1)
		expect(resolution.requirements.map((item) => item.id)).toEqual(
			expect.arrayContaining([
				"lodging.ownership_proof",
				"lodging.establishment_license",
				"tour.guide_credential",
				"tour.operator_license",
				"tour.insurance",
			])
		)
		const uploads = packUploadOptions(resolution).map((item) => item.value)
		expect(new Set(uploads).size).toBe(uploads.length)
		expect(uploads).toEqual(
			expect.arrayContaining([
				"address_proof",
				"ownership_proof",
				"operating_license::lodging.establishment_license",
				"operating_license::tour.guide_credential",
				"operating_license::tour.operator_license",
				"insurance",
			])
		)
		expect(matchUpload(resolution, "operating_license")).toBeNull()
		expect(accountGateDocumentTypes(resolution)).toEqual([
			"government_id",
			"business_registration",
			"tax_document",
		])
		expect(
			resolution.requirements
				.filter((item) => item.layer === "lodging")
				.every((item) => !item.accountDocuments)
		).toBe(true)
	})

	it("keeps ownership and the establishment license inside the lodging pack", () => {
		const resolution = resolveVerificationRequirements(
			input({
				lines: ["lodging"],
				tours: [],
				holderType: "persona_natural",
				collectionModel: "undecided",
			})
		)
		expect(ids({ lines: ["lodging"], tours: [], collectionModel: "undecided" })).toEqual([
			"shared.legal_name",
			"shared.government_id",
			"shared.tax_document",
			"lodging.ownership_proof",
			"lodging.establishment_license",
		])
		expect(resolution.requirements.some((item) => item.layer === "tour")).toBe(false)
		expect(packUploadOptions(resolution).map((item) => item.value)).toEqual([
			"ownership_proof",
			"operating_license::lodging.establishment_license",
		])
	})

	it("leaves hotel publish on the same five account checks", () => {
		expect(governanceCheckIdsFor("publish")).toEqual([
			"identity",
			"operations",
			"verification",
			"fiscality",
			"team",
		])
		expect(requiredKycDocumentTypes).toEqual([
			"government_id",
			"business_registration",
			"tax_document",
		])
		expect(read("src/pages/api/product/publish.ts")).not.toContain("requirement-resolver")
		expect(read("src/pages/api/booking/confirm.ts")).not.toContain("requirement-resolver")
		expect(read("src/pages/api/provider/settings/documents.ts")).toContain(
			"document_not_applicable"
		)
		expect(read("src/lib/provider-governance.ts")).toContain("accountGateDocumentTypes")
	})

	it("completes the account documents gate without a hidden entity slot", () => {
		expect(
			evaluateRequiredKycDocumentsComplete(
				[
					{ type: "government_id", status: "verified" },
					{ type: "tax_document", status: "verified" },
				],
				{ requiredTypes: ["government_id", "tax_document"] }
			).complete
		).toBe(true)
		expect(
			evaluateRequiredKycDocumentsComplete([
				{ type: "government_id", status: "verified" },
				{ type: "tax_document", status: "verified" },
			]).missingRequiredTypes
		).toEqual(["business_registration"])
	})
})
