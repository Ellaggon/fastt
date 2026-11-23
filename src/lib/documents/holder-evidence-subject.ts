export function isPersonalHolderDefinition(key: string | undefined) {
	return key === "bo.holder.personal_identity" || key === "bo.holder.tax_registration"
}

export function nationalHolderUploadSubject(
	key: string | undefined,
	holderType: string | null,
	providerId: string | undefined
) {
	if (!providerId) return undefined
	if (holderType === "persona_natural" && isPersonalHolderDefinition(key))
		return { type: "person" as const, reference: providerId }
	if (
		holderType === "entidad" &&
		[
			"bo.holder.entity_existence",
			"bo.holder.entity_representation",
			"bo.holder.tax_registration",
		].includes(key ?? "")
	)
		return { type: "legal_entity" as const, reference: providerId }
	return undefined
}

export function isNationalPersonalHolderSubject(input: {
	definitionKey?: string
	subjectType: string
	subjectReference: string | null
	providerId: string
	holderType: string | null
}) {
	return (
		isPersonalHolderDefinition(input.definitionKey) &&
		input.subjectType === "person" &&
		input.subjectReference === input.providerId &&
		input.holderType === "persona_natural"
	)
}
