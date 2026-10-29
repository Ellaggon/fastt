import { describe, expect, it } from "vitest"
import {
	tourOperationSchema,
	operationRole,
	operationActivityClasses,
	operationSubjects,
	readTourOperation,
	projectOperationContext,
	type TourOperation,
} from "@/shared/domain/tour-operation"
import { legalFormForCountry } from "@/shared/domain/legal-forms"
import { parseHolderDeclaration } from "@/lib/provider-holder-profile"

const partner = "10000000-0000-4000-8000-000000000001"
const transport = "10000000-0000-4000-8000-000000000002"
const resource = "10000000-0000-4000-8000-000000000003"
const base: TourOperation = {
	version: 2,
	executionMode: "self",
	guidingService: false,
	characteristics: [],
	operatorResourceId: null,
	waterActivity: false,
	airActivity: false,
	foodHandling: "none",
	transportServices: [],
	resourceIds: [],
}

describe("normalized operational declarations", () => {
	it("uses normalized facts rather than a divergent cached role or activity list", () => {
		const result = projectOperationContext({
			operationJson: { ...base, waterActivity: true },
			operatingRole: "guide",
			activityClassesJson: ["water_air"],
		})
		expect(result.operatingRole).toBe("operator")
		expect(result.activityClassesJson).toEqual(["water"])
		const invalid = projectOperationContext({
			operationJson: { version: 2 },
			operatingRole: "guide",
			activityClassesJson: ["urban_cultural"],
		})
		expect(invalid.operatingRole).toBeNull()
		expect(invalid.activityClassesJson).toEqual([])
	})
	it("does not infer a guide credential from personal execution", () => {
		expect(operationRole(base)).toBe("operator")
		expect(operationRole({ ...base, guidingService: true })).toBe("guide")
	})
	it("does not force a workshop to pretend it is a cultural or adventure tour", () => {
		expect(operationActivityClasses(base)).toEqual(["general_experience"])
	})
	it("requires an identified external executor", () => {
		expect(tourOperationSchema.safeParse({ ...base, executionMode: "external" }).success).toBe(
			false
		)
		expect(
			tourOperationSchema.safeParse({
				...base,
				executionMode: "external",
				operatorResourceId: partner,
			}).success
		).toBe(true)
	})
	it("rejects external identities attached to self operation", () => {
		expect(tourOperationSchema.safeParse({ ...base, operatorResourceId: partner }).success).toBe(
			false
		)
	})
	it("separates water and air without translating historical water_air", () => {
		expect(readTourOperation({ operatingRole: "guide", activityClasses: ["water_air"] })).toBeNull()
		expect(
			operationActivityClasses({
				...base,
				waterActivity: true,
				characteristics: ["urban_cultural"],
			})
		).toEqual(["urban_cultural", "water"])
		expect(operationActivityClasses({ ...base, airActivity: true, waterActivity: true })).toEqual([
			"water",
			"air",
		])
	})
	it("supports transport segments with different responsible parties", () => {
		const operation: TourOperation = {
			...base,
			transportServices: [
				{
					id: transport,
					label: "Traslado inicial",
					providedBy: "business",
					operatorResourceId: null,
				},
				{ id: resource, label: "Regreso", providedBy: "external", operatorResourceId: partner },
			],
		}
		expect(tourOperationSchema.safeParse(operation).success).toBe(true)
		expect(operationActivityClasses(operation)).toEqual(["transport", "transport_subcontracted"])
		expect(operationSubjects(operation)).toEqual([partner])
	})
	it("rejects transport without a responsible subcontractor and duplicate segments", () => {
		const service = {
			id: transport,
			label: "Traslado",
			providedBy: "external",
			operatorResourceId: null,
		}
		expect(tourOperationSchema.safeParse({ ...base, transportServices: [service] }).success).toBe(
			false
		)
		expect(
			tourOperationSchema.safeParse({
				...base,
				transportServices: [
					{ ...service, operatorResourceId: partner },
					{ ...service, operatorResourceId: partner },
				],
			}).success
		).toBe(false)
	})
	it("rejects fake approval fields in a declaration", () => {
		expect(tourOperationSchema.safeParse({ ...base, verified: true }).success).toBe(false)
	})
})

describe("country-specific legal classification", () => {
	it("does not classify a sole trader as a legal entity", () => {
		expect(legalFormForCountry("BO:sole_trader", "BO")?.holderType).toBe("persona_natural")
		expect(legalFormForCountry("BO:sole_trader", "CL")).toBeUndefined()
	})
	it("rejects mismatched country and holder classification on submission", () => {
		const form = new FormData()
		form.set("holderCountry", "BO")
		form.set("holderType", "persona_natural")
		form.set("legalFormCode", "BO:sole_trader")
		expect(parseHolderDeclaration(form)?.legalFormCode).toBe("BO:sole_trader")
		form.set("holderType", "entidad")
		expect(() => parseHolderDeclaration(form)).toThrow("holder_declaration_invalid")
	})
	it("preserves unknown classification instead of guessing a foreign legal form", () => {
		const form = new FormData()
		form.set("holderCountry", "CL")
		form.set("holderType", "entidad")
		expect(parseHolderDeclaration(form)?.legalFormCode).toBeNull()
	})
})
