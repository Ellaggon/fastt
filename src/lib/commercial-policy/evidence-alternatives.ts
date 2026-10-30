import { documentAcceptanceSchema } from "@/shared/domain/document-acceptance"

/** Repeated checkbox groups express OR between packages and AND inside each package. */
export function parseEvidenceAlternatives(form: FormData) {
	const groups = new Map<number, string[]>()
	for (const [key, value] of form) {
		const match = /^alternative\.(\d{1,2})$/.exec(key)
		if (!match) continue
		const index = Number(match[1])
		const values = groups.get(index) ?? []
		values.push(String(value))
		groups.set(index, values)
	}
	return documentAcceptanceSchema.parse({
		version: 1,
		alternatives: [...groups]
			.sort(([a], [b]) => a - b)
			.map(([index, ids]) => ({
				id: `alternative-${index + 1}`,
				allOf: ids.map((definitionVersionId) => ({ definitionVersionId })),
			})),
	})
}
