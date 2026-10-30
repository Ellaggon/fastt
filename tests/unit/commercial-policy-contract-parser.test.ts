import { describe, expect, it } from "vitest"
import {
	normalizeContextSelector,
	normalizeRequirementCondition,
	parseAcceptedEvidence,
} from "@/lib/commercial-policy/contract-parser"

describe("shared commercial policy contract", () => {
	it("preserves normalized operational dimensions for execution and ratification", () => {
		const input = {
			legalFormCodes: ["BO:sole_trader"],
			executionModes: ["external"],
			foodHandlingModes: ["prepare"],
			transportProviders: ["external"],
			operatingRoles: ["operator"],
			activityClasses: ["cultural"],
			jurisdictionCodes: ["geo:bo"],
			contextVersion: 2,
			experienceFormats: ["tour"],
		}
		expect(normalizeContextSelector(input)).toMatchObject(input)
		expect(normalizeRequirementCondition(input)).toMatchObject({
			legalFormCodes: input.legalFormCodes,
			executionModes: input.executionModes,
			foodHandlingModes: input.foodHandlingModes,
			transportProviders: input.transportProviders,
		})
	})
	it("preserves historical alternative types without rewriting their contract", () => {
		expect(parseAcceptedEvidence(["government_id", "tax_document"])).toEqual({
			acceptedEvidence: ["government_id", "tax_document"],
			documentAcceptance: null,
		})
	})
	it("retains complete versioned packages during ratification", () => {
		const contract = {
			version: 1,
			alternatives: [
				{ id: "package", allOf: [{ definitionVersionId: "a:1" }, { definitionVersionId: "b:1" }] },
			],
		}
		expect(parseAcceptedEvidence(contract).documentAcceptance).toEqual(contract)
	})
	it("rejects unknown contract versions instead of silently emptying them", () => {
		expect(() => parseAcceptedEvidence({ version: 99, alternatives: [] })).toThrow()
	})
})
