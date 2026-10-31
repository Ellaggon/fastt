import type { CommercialPolicyDiagnosis } from "./evaluate"

/** Public presentation only: no files, reviewer notes or authorization decisions. */
export function presentPolicyEvidence(
	diagnosis: CommercialPolicyDiagnosis | null | undefined,
	resources: readonly { id: string; name: string }[] = [],
	canManage = false
) {
	return (diagnosis?.applicableRequirements ?? [])
		.filter((item) => item.documentAcceptance)
		.map((item) => {
			const blocker = diagnosis?.blockers.find(
				(row) =>
					row.policyVersionId === item.policyVersionId && row.id === `requirement_${item.key}`
			)
			const result = diagnosis?.evaluation?.requirements.find(
				(row) => row.policyVersionId === item.policyVersionId && row.key === item.key
			)
			const state = blocker?.evidenceState ?? (blocker ? "missing" : "verified")
			const subjects =
				result?.package?.subjects.map((subject) => ({
					label:
						resources.find((resource) => resource.id === subject.subjectId)?.name ??
						(item.condition?.evidenceSubjectSelector === "holder"
							? "Titular del negocio"
							: "Persona o recurso declarado"),
					complete: Boolean(subject.satisfiedBy),
					missingDefinitionIds: [
						...new Set(subject.alternatives.flatMap((alternative) => alternative.missing)),
					],
				})) ?? []
			return {
				key: item.key,
				policyVersionId: item.policyVersionId,
				state,
				subjects,
				canUpload:
					canManage &&
					Boolean(blocker) &&
					state !== "pending_review" &&
					(result?.package == null || subjects.length > 0),
				label:
					state === "verified"
						? "Documentación vigente"
						: state === "pending_review"
							? "En revisión"
							: state === "expired"
								? "Requiere renovación"
								: state === "rejected"
									? "Requiere corrección"
									: "Requiere documentación",
			}
		})
}
