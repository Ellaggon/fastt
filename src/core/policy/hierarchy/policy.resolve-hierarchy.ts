import { findAssignment } from "@/repositories/policy/PolicyAssignmentRepository"
import { findActivePolicy } from "@/repositories/policy/PolicyFindActiveByGroup"
import { getHierarchyChain } from "./policy.hierarchy-chain"
import { POLICY_PRIORITY } from "./policy.priority"
import { db, eq, PolicyRule, CancellationTier } from "astro:db" // Importar tablas hijas

export async function resolvePolicyByHierarchy(
    category: string,
    entityType: string,
    entityId: string
) {
    const hierarchy = await getHierarchyChain(entityType, entityId)
    let best: any = null

    for (const node of hierarchy) {
        const assignment = await findAssignment(node.type, node.id, category)
        if (!assignment) continue

        const activePolicy = await findActivePolicy(assignment.PolicyAssignment.policyGroupId)
        if (!activePolicy) continue

        // 🔥 PASO CLAVE: Buscar las reglas y tiers asociados a esta política activa
        const [rules, cancellation] = await Promise.all([
            db.select().from(PolicyRule).where(eq(PolicyRule.policyId, activePolicy.id)),
            db.select().from(CancellationTier).where(eq(CancellationTier.policyId, activePolicy.id))
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