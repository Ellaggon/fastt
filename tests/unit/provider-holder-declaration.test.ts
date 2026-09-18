import { describe, expect, it } from "vitest"
import {
	collectionModelForIdentitySave,
	parseHolderDeclaration,
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
	it("rejects malformed or inferred identity", () => {
		const form = new FormData()
		form.set("holderType", "professional")
		form.set("holderCountry", "Chile")
		expect(() => parseHolderDeclaration(form)).toThrow("holder_declaration_invalid")
	})
})
