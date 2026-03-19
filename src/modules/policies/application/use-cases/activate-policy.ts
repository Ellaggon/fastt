import type { PolicyCommandRepositoryPort } from "../ports/PolicyCommandRepositoryPort"
import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"

export async function activatePolicy(
	deps: {
		commandRepo: PolicyCommandRepositoryPort
		queryRepo: PolicyQueryRepositoryPort
		runPolicyCompiler: (entityType: string, entityId: string) => Promise<void>
	},
	params: { policyId: string; effectiveFrom?: string }
) {
	const effectiveDateIso = params.effectiveFrom
		? new Date(params.effectiveFrom).toISOString()
		: new Date().toISOString()

	const { groupId } = await deps.commandRepo.activatePolicy({
		policyId: params.policyId,
		effectiveFromIso: effectiveDateIso,
	})

	const assignments = await deps.queryRepo.listAssignmentsByGroupId(groupId)

	Promise.all(assignments.map((a: any) => deps.runPolicyCompiler(a.scope, a.scopeId))).catch(
		console.error
	)

	return { success: true as const }
}
