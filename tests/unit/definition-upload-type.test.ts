import { expect, it } from "vitest"
import { definedUploadType } from "@/lib/documents/definition-upload-type"

it.each([
	["bo.holder.personal_identity", "identity", "government_id"],
	["bo.holder.entity_existence", "identity", "business_registration"],
	["bo.holder.entity_representation", "identity", "business_registration"],
	["bo.holder.tax_registration", "fiscal", "tax_document"],
	["bo.tour.operator_authorization", "tourism", "operating_license"],
])("routes %s only with its declared family", (key, family, type) => {
	expect(definedUploadType({ key, family })).toBe(type)
	expect(definedUploadType({ key, family: "government_id" })).toBeUndefined()
})

it("does not infer a type from unknown national definitions", () => {
	expect(definedUploadType({ key: "unknown", family: "identity" })).toBeNull()
})
