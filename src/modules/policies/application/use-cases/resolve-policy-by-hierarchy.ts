import { POLICY_PRIORITY } from "../../domain/policy.priority"
import type { PolicyQueryRepositoryPort } from "../ports/PolicyQueryRepositoryPort"

export async function resolvePolicyByHierarchy(
	deps: { queryRepo: PolicyQueryRepositoryPort },
	params: { category: string; entityType: string; entityId: string }
) {
	const hierarchy = await getHierarchyChain(deps.queryRepo, params.entityType, params.entityId)
	let best: any = null

	for (const node of hierarchy) {
		const assignment = await deps.queryRepo.findAssignment(node.type, node.id, params.category)
		if (!assignment) continue

		const activePolicy = await deps.queryRepo.findActivePolicy(
			assignment.PolicyAssignment.policyGroupId
		)
		if (!activePolicy) continue

		// 🔥 PASO CLAVE: Buscar las reglas y tiers asociados a esta política activa
		const [rules, cancellation] = await Promise.all([
			deps.queryRepo.listPolicyRulesByPolicyId(activePolicy.id),
			deps.queryRepo.listCancellationTiersByPolicyId(activePolicy.id),
		])

		const priority = POLICY_PRIORITY[node.type as keyof typeof POLICY_PRIORITY]

		if (!best || priority > best.priority) {
			best = {
				policyId: activePolicy.id,
				groupId: activePolicy.groupId,
				description: activePolicy.description,
				rules: rules, // 👈 Ahora sí pasamos las reglas
				cancellation: cancellation, // 👈 Y los tiers de cancelación
				priority,
			}
		}
	}
	return best
}

async function getHierarchyChain(
	queryRepo: PolicyQueryRepositoryPort,
	entityType: string,
	entityId: string
) {
	const chain: { type: string; id: string }[] = []

	let currentType = entityType
	let currentId = entityId

	while (currentType) {
		chain.push({ type: currentType, id: currentId })

		const parent = await queryRepo.findParent(currentType, currentId)
		if (!parent) break

		currentType = parent.type
		currentId = parent.id
	}

	chain.push({ type: "global", id: "global" })

	return chain
}
