const mappings = {
	"bo.holder.personal_identity": { family: "identity", type: "government_id" },
	"bo.holder.entity_existence": { family: "identity", type: "business_registration" },
	"bo.holder.entity_representation": { family: "identity", type: "business_registration" },
	"bo.holder.tax_registration": { family: "fiscal", type: "tax_document" },
	"bo.tour.operator_authorization": { family: "tourism", type: "operating_license" },
} as const

/** A transport type is not evidence equivalence: the exact definition remains mandatory. */
export function definedUploadType(definition: { key?: string; family: string }) {
	const mapping = mappings[definition.key as keyof typeof mappings]
	if (!mapping) return null
	return mapping.family === definition.family ? mapping.type : undefined
}
