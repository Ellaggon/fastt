import { buildPolicySnapshot } from "./policy.build-snapshot"
import { clearPolicyCache } from "../runtime/policy.runtime-cache"

export async function runPolicyCompiler(entityType: string, entityId: string) {
	await buildPolicySnapshot(entityType, entityId)
	clearPolicyCache(entityType, entityId)
}
