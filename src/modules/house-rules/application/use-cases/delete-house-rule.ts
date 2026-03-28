import type { HouseRuleRepositoryPort } from "../ports/HouseRuleRepositoryPort"

export async function deleteHouseRule(
	deps: { repo: HouseRuleRepositoryPort },
	id: string
): Promise<void> {
	const rid = String(id ?? "").trim()
	if (!rid) throw new Error("validation_error:id_required")
	await deps.repo.delete(rid)
}
