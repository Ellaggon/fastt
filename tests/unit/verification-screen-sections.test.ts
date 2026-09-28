import { describe, expect, it } from "vitest"

import { visibleVerificationTrustLinks } from "@/lib/provider-verification-workspace"
import { resolveVerificationRequirements } from "@/lib/verification/requirement-resolver"
import {
	buildVerificationScreenSections,
	type VerificationScreenInput,
} from "@/lib/verification/screen-sections"
import { governanceCheckIdsFor } from "@/lib/verification/governance-capabilities"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

function screen(overrides: Partial<VerificationScreenInput> = {}) {
	const requirements = resolveVerificationRequirements({
		lines: overrides.lines ?? ["tour"],
		holderType: "persona_natural",
		holderCountry: "BO",
		taxResidenceCountry: null,
		collectionModel: overrides.collectionModel ?? "property_collect",
		tours: [
			{
				productId: "tour-lp",
				operatingRole: "guide",
				activityClasses: ["urban_cultural"],
				jurisdictionCode: "BO-LP",
				departureResourceIds: ["guide-ana"],
			},
		],
	})
	return buildVerificationScreenSections({
		lines: ["tour"],
		collectionModel: "property_collect",
		legalNameComplete: true,
		accountStatus: "approved",
		fiscalStatus: "verified",
		paymentsState: "not_started",
		documents: [{ type: "government_id", status: "verified" }],
		slots: [
			{ type: "government_id", state: "verified" },
			{ type: "tax_document", state: "verified" },
		],
		...overrides,
		requirements: overrides.requirements ?? requirements.requirements,
	})
}

describe("verification screen sections", () => {
	it("gives a tour guide shared and experience sections, and drops payments from selling", () => {
		const result = screen()
		expect(result.sections.map((section) => section.id)).toEqual(["shared", "tour"])
		expect(result.paymentsCountsForSelling).toBe(false)
		const sharedIds = result.sections[0].items.map((entry) => entry.id)
		expect(sharedIds).toEqual([
			"shared.legal_name",
			"shared.account_review",
			"shared.government_id",
			"shared.tax_document",
		])
		expect(sharedIds).not.toContain("shared.business_registration")
		expect(sharedIds).not.toContain("shared.payout_account")
		expect(result.applicable.totalCount).toBe(5)
		expect(result.sections[1].items.map((entry) => entry.id)).toEqual(["tour.guide_credential"])
		expect(result.sections[1].selling?.totalCount).toBe(5)
		expect(result.sections[1].sellingNote).toContain("Pagos no entra")
		expect(result.sections[1].progress.totalCount).toBe(1)
	})

	it("counts the Fastt payout only when Fastt collects", () => {
		const result = screen({ collectionModel: "platform_collect" })
		expect(result.paymentsCountsForSelling).toBe(true)
		expect(result.sections[0].items.map((entry) => entry.id)).toEqual(
			expect.arrayContaining(["shared.address_proof", "shared.payout_account"])
		)
		expect(result.sections[1].sellingNote).toContain("liquidación de Fastt")
		expect(result.applicable.totalCount).toBe(
			result.sections[0].progress.totalCount + result.sections[1].progress.totalCount
		)
	})

	it("keeps lodging evidence in its own section and out of a tour percentage", () => {
		const requirements = resolveVerificationRequirements({
			lines: ["lodging", "tour"],
			holderType: "entidad",
			holderCountry: "BO",
			taxResidenceCountry: "BO",
			collectionModel: "property_collect",
			tours: [],
		})
		const result = screen({
			lines: ["lodging", "tour"],
			requirements: requirements.requirements,
			collectionModel: "property_collect",
		})
		expect(result.sections.map((section) => section.id)).toEqual(["shared", "lodging", "tour"])
		const shared = result.sections[0].items.map((entry) => entry.id)
		expect(shared.filter((id) => id === "shared.business_registration")).toHaveLength(1)
		expect(shared.filter((id) => id === "shared.tax_document")).toHaveLength(1)
		expect(result.sections[1].items.map((entry) => entry.id)).toEqual([
			"lodging.ownership_proof",
			"lodging.establishment_license",
		])
		expect(result.sections[2].items.map((entry) => entry.id)).toEqual(["tour.context_missing"])
		expect(result.sections[2].items[0]?.href).toContain("/product/create")
		expect(result.sections[2].progress.totalCount).toBe(1)
		expect(result.sections[1].selling?.totalCount).toBe(result.sections[0].progress.totalCount + 2)
		expect(result.sections[2].selling?.totalCount).toBe(result.sections[0].progress.totalCount + 1)
	})

	it("does not count a hotel licence as ready for the selected tour", () => {
		const hotelLicence = screen({
			evidence: [
				{ id: "identity", type: "government_id", status: "verified" },
				{
					id: "hotel-licence",
					type: "operating_license",
					status: "verified",
					scopes: [{ scopeType: "product", productId: "hotel-1" }],
				},
			],
			tourOperation: {
				productId: "tour-lp",
				territoryCodes: ["BO-LP"],
				activityClasses: ["urban_cultural"],
			},
		})
		const hotelItem = hotelLicence.sections[1].items.find(
			(entry) => entry.id === "tour.guide_credential"
		)
		expect(hotelItem).toMatchObject({
			state: "action_needed",
			stateDetail: "Hay una evidencia, pero no cubre esta experiencia.",
		})

		const tourLicenceWithoutGuide = screen({
			evidence: [
				{ id: "identity", type: "government_id", status: "verified" },
				{
					id: "tour-licence",
					type: "operating_license",
					status: "verified",
					subjectType: "person",
					scopes: [{ scopeType: "product", productId: "tour-lp" }],
				},
			],
			tourOperation: {
				productId: "tour-lp",
				territoryCodes: ["BO-LP"],
				activityClasses: ["urban_cultural"],
			},
		})
		expect(
			tourLicenceWithoutGuide.sections[1].items.find(
				(entry) => entry.id === "tour.guide_credential"
			)
		).toMatchObject({
			state: "action_needed",
			stateDetail: "Hay una evidencia, pero no cubre esta experiencia.",
		})
	})

	it("leaves a requirement without a document out of the percentage", () => {
		const requirements = resolveVerificationRequirements({
			lines: ["tour"],
			holderType: "persona_natural",
			holderCountry: "BO",
			taxResidenceCountry: null,
			collectionModel: "property_collect",
			tours: [
				{
					productId: "food",
					operatingRole: "guide",
					activityClasses: ["gastronomic"],
					jurisdictionCode: "BO-LP",
					departureResourceIds: [],
				},
			],
		})
		const result = screen({ requirements: requirements.requirements })
		const food = result.sections[1].items.find((entry) => entry.id === "tour.food_handling_pending")
		expect(food?.countsTowardProgress).toBe(false)
		const role = resolveVerificationRequirements({
			lines: ["tour"],
			holderType: "persona_natural",
			holderCountry: "BO",
			taxResidenceCountry: null,
			collectionModel: "property_collect",
			tours: [
				{
					productId: "otra-prueba",
					operatingRole: null,
					activityClasses: [],
					jurisdictionCode: null,
					departureResourceIds: [],
				},
			],
		})
		const roleItem = screen({ requirements: role.requirements }).sections[1].items.find(
			(entry) => entry.id === "tour.operating_role_missing"
		)
		expect(roleItem?.href).toBeNull()
		expect(roleItem?.stateLabel).toBe("Completar")
		expect(result.sections[1].progress.totalCount).toBe(1)
		expect(result.applicable.totalCount).toBe(result.sections[0].progress.totalCount + 1)
	})

	it("counts the account playbook like lodging: one step per tab, not one per field", () => {
		const guide = visibleVerificationTrustLinks(
			[
				{ id: "identity", label: "Identidad", uiState: "ready" },
				{ id: "business", label: "Negocio", uiState: "not_started" },
				{ id: "fiscal", label: "Fiscal", uiState: "in_review" },
				{ id: "payments", label: "Pagos", uiState: "not_started" },
			] as never,
			screen()
		)
		expect(guide.map((link) => link.id)).toEqual(["identity", "fiscal"])

		const entity = screen({
			lines: ["tour"],
			requirements: resolveVerificationRequirements({
				lines: ["tour"],
				holderType: "entidad",
				holderCountry: "BO",
				taxResidenceCountry: "BO",
				collectionModel: "property_collect",
				tours: [
					{
						productId: "tour-lp",
						operatingRole: "operator",
						activityClasses: ["urban_cultural"],
						jurisdictionCode: "BO-LP",
						departureResourceIds: [],
					},
				],
			}).requirements,
		})
		const entityTabs = visibleVerificationTrustLinks(
			[
				{ id: "identity", label: "Identidad" },
				{ id: "business", label: "Negocio" },
				{ id: "fiscal", label: "Fiscal" },
				{ id: "payments", label: "Pagos" },
			] as never,
			entity
		)
		expect(entityTabs.map((link) => link.id)).toEqual(["identity", "business", "fiscal"])
	})

	it("does not move hotel publish onto the screen sections", () => {
		expect(governanceCheckIdsFor("publish")).toEqual([
			"identity",
			"operations",
			"verification",
			"fiscality",
			"team",
		])
		const publish = readFileSync(new URL("src/pages/api/product/publish.ts", root), "utf8")
		expect(publish).not.toContain("screen-sections")
	})
})
