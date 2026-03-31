import { z } from "zod"
import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"

const schema = z.object({ holdId: z.string().uuid() })

export async function releaseInventoryHold(
	deps: { repo: InventoryHoldRepositoryPort },
	params: { holdId: string }
) {
	const parsed = schema.parse(params)
	return deps.repo.releaseHold(parsed)
}
