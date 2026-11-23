import { expect, it } from "vitest"
import {
	isNationalPersonalHolderSubject,
	nationalHolderUploadSubject,
} from "@/lib/documents/holder-evidence-subject"

const holder = {
	definitionKey: "bo.holder.personal_identity",
	subjectType: "person",
	subjectReference: "provider-a",
	providerId: "provider-a",
	holderType: "persona_natural",
}

it("derives the national subject without asking for a guide or an arbitrary identifier", () => {
	expect(
		nationalHolderUploadSubject("bo.holder.personal_identity", "persona_natural", "provider-a")
	).toEqual({ type: "person", reference: "provider-a" })
	expect(
		nationalHolderUploadSubject("bo.holder.entity_representation", "entidad", "provider-a")
	).toEqual({ type: "legal_entity", reference: "provider-a" })
	expect(
		nationalHolderUploadSubject("bo.tour.guide_credential", "persona_natural", "provider-a")
	).toBeUndefined()
})

it("recognizes the declared natural-person holder for national identity and tax", () => {
	expect(isNationalPersonalHolderSubject(holder)).toBe(true)
	expect(
		isNationalPersonalHolderSubject({ ...holder, definitionKey: "bo.holder.tax_registration" })
	).toBe(true)
})

it.each([
	{ holderType: "entidad" },
	{ holderType: null },
	{ subjectReference: "another-provider" },
	{ subjectReference: null },
	{ subjectType: "resource" },
	{ definitionKey: "bo.tour.guide_credential" },
	{ definitionKey: undefined },
])("does not treat unrelated persons or resources as the holder: %j", (change) => {
	expect(isNationalPersonalHolderSubject({ ...holder, ...change })).toBe(false)
})
