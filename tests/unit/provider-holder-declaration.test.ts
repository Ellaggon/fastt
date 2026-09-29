import { describe, expect, it } from "vitest"
import {
	collectionModelForIdentitySave,
	HolderDeclarationRequiredError,
	isDocumentUploadPausedForHolderReview,
	isHolderDeclarationInReview,
	parseHolderDeclaration,
	resolveHolderDeclarationForSubmit,
} from "@/lib/provider-holder-profile"

describe("provider holder declaration", () => {
	it("preserves legacy submissions without silently classifying their holder", () => {
		const form = new FormData()
		form.set("legalName", "Ejemplo")
		expect(parseHolderDeclaration(form)).toBeNull()
	})
	it("normalizes explicit jurisdictions while leaving payment undecided", () => {
		const form = new FormData()
		form.set("holderType", "persona_natural")
		form.set("holderCountry", "cl")
		form.set("taxResidenceCountry", "bo")
		expect(parseHolderDeclaration(form)).toEqual({
			holderType: "persona_natural",
			holderCountry: "CL",
			taxResidenceCountry: "BO",
			payoutCountry: null,
			collectionModel: "undecided",
		})
	})
	it("does not accept a collection decision through the identity form", () => {
		const form = new FormData()
		form.set("holderType", "persona_natural")
		form.set("holderCountry", "cl")
		form.set("collectionModel", "platform_collect")
		expect(parseHolderDeclaration(form)).toMatchObject({ collectionModel: "undecided" })
	})
	it("preserves a prior collection decision when identity is edited", () => {
		expect(collectionModelForIdentitySave({ collectionModel: "property_collect" })).toBe(
			"property_collect"
		)
		expect(collectionModelForIdentitySave(null)).toBe("undecided")
	})
	it("detects holder declaration in review", () => {
		expect(isHolderDeclarationInReview({ declarationStatus: "in_review" })).toBe(true)
		expect(isHolderDeclarationInReview({ declarationStatus: "declared" })).toBe(false)
		expect(isHolderDeclarationInReview(null)).toBe(false)
	})

	it("pauses identity uploads during holder review but allows mercantile for entidad", () => {
		const inReview = { declarationStatus: "in_review" as const, holderType: "entidad" as const }
		expect(
			isDocumentUploadPausedForHolderReview({
				holder: inReview,
				documentType: "government_id",
			})
		).toBe(true)
		expect(
			isDocumentUploadPausedForHolderReview({
				holder: inReview,
				documentType: "business_registration",
			})
		).toBe(false)
		expect(
			isDocumentUploadPausedForHolderReview({
				holder: { declarationStatus: "in_review", holderType: "persona_natural" },
				documentType: "business_registration",
			})
		).toBe(true)
	})

	it("requires an explicit holder declaration when onboarding demands it", async () => {
		const form = new FormData()
		form.set("displayName", "Tour demo")
		form.set("legalName", "Demo")
		await expect(resolveHolderDeclarationForSubmit(form, { required: true })).rejects.toBeInstanceOf(
			HolderDeclarationRequiredError
		)
	})

	it("rejects malformed or inferred identity", () => {
		const form = new FormData()
		form.set("holderType", "professional")
		form.set("holderCountry", "Chile")
		expect(() => parseHolderDeclaration(form)).toThrow("holder_declaration_invalid")
	})
})
