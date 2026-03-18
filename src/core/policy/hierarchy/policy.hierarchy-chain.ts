import { findParent } from "@/repositories/policy/PolicyHierarchyRepository"

export async function getHierarchyChain(entityType: string, entityId: string) {
	const chain: { type: string; id: string }[] = []

	let currentType = entityType
	let currentId = entityId

	while (currentType) {
		chain.push({ type: currentType, id: currentId })

		const parent = await findParent(currentType, currentId)
		if (!parent) break

		currentType = parent.type
		currentId = parent.id
	}

	chain.push({ type: "global", id: "global" })

	return chain
}
