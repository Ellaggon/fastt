import { z } from "zod"

export const policyFamilies = [
	"identity",
	"fiscal",
	"tourism",
	"specialized_activity",
	"regulated_place",
	"operational_resources",
	"platform_standards",
] as const
export const policyFamilyLabels: Record<(typeof policyFamilies)[number], string> = {
	identity: "Identidad y representación",
	fiscal: "Fiscalidad",
	tourism: "Habilitación turística",
	specialized_activity: "Actividad especializada",
	regulated_place: "Lugares regulados",
	operational_resources: "Recursos operativos",
	platform_standards: "Estándares de Fastt",
}
export const compositionSchema = z
	.object({
		kind: z.enum(["admission", "requirements"]),
		family: z.enum(policyFamilies),
		requiredFamilies: z.array(z.enum(policyFamilies)).max(7).default([]),
		replacesVersionIds: z.array(z.string().min(1).max(200)).max(50).default([]),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.kind === "admission" && !value.requiredFamilies.length)
			ctx.addIssue({ code: "custom", message: "Admission must explicitly declare coverage" })
		if (value.kind === "requirements" && value.requiredFamilies.length)
			ctx.addIssue({ code: "custom", message: "Only admission declares required families" })
		if (new Set(value.replacesVersionIds).size !== value.replacesVersionIds.length)
			ctx.addIssue({ code: "custom", message: "Duplicate replacement" })
	})
export type PolicyComposition = z.infer<typeof compositionSchema>

type Candidate = { id: string; policySetId?: string; composition: PolicyComposition }
/** Resolves only already applicable, approved, effective versions. No implicit priority. */
export function composePolicyVersions(
	candidates: readonly Candidate[],
	references: readonly Candidate[] = candidates,
	priorReplacements: readonly Candidate[] = []
) {
	for (const candidate of candidates) compositionSchema.parse(candidate.composition)
	const byId = new Map(references.map((candidate) => [candidate.id, candidate]))
	const conflicts: string[] = []
	const replacedBy = new Map<string, string>()
	const replacementSources = [
		...candidates,
		...priorReplacements.filter(
			(candidate) => !candidates.some((active) => active.id === candidate.id)
		),
	]
	for (const candidate of replacementSources) {
		for (const targetId of candidate.composition.replacesVersionIds) {
			const target = byId.get(targetId)
			if (
				!target ||
				targetId === candidate.id ||
				target.composition.kind !== candidate.composition.kind ||
				target.composition.family !== candidate.composition.family
			) {
				conflicts.push(`invalid_replacement:${candidate.id}:${targetId}`)
				continue
			}
			if (replacedBy.has(targetId)) conflicts.push(`competing_replacement:${targetId}`)
			replacedBy.set(targetId, candidate.id)
		}
	}
	for (const candidate of replacementSources) {
		const visited = new Set<string>()
		let id: string | undefined = candidate.id
		while (id) {
			if (visited.has(id)) {
				conflicts.push(`replacement_cycle:${candidate.id}`)
				break
			}
			visited.add(id)
			id = replacedBy.get(id)
		}
	}
	const selected = candidates.filter((candidate) => !replacedBy.has(candidate.id))
	const admissions = selected.filter((candidate) => candidate.composition.kind === "admission")
	if (admissions.length !== 1) conflicts.push("admission_not_unique")
	const sets = new Set<string>()
	for (const candidate of selected) {
		if (!candidate.policySetId) continue
		if (sets.has(candidate.policySetId))
			conflicts.push(`concurrent_versions:${candidate.policySetId}`)
		sets.add(candidate.policySetId)
	}
	const required = admissions.flatMap((candidate) => candidate.composition.requiredFamilies)
	const missingFamilies = [...new Set(required)].filter(
		(family) =>
			!selected.some(
				(candidate) =>
					candidate.composition.kind === "requirements" && candidate.composition.family === family
			)
	)
	return {
		selectedIds: selected.map((candidate) => candidate.id),
		replacements: [...replacedBy].map(([versionId, replacedByVersionId]) => ({
			versionId,
			replacedByVersionId,
		})),
		conflicts: [...new Set(conflicts)],
		missingFamilies,
	}
}
