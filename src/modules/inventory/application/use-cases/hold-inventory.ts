import { z } from "zod"
import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"

const holdInventorySchema = z.object({
	variantId: z.string().min(1),
	checkIn: z.date(),
	checkOut: z.date(),
	quantity: z.number().int().min(1),
	holdId: z.string().uuid(),
	expiresAt: z.date(),
})

export async function holdInventory(
	deps: { repo: InventoryHoldRepositoryPort },
	params: {
		variantId: string
		checkIn: Date
		checkOut: Date
		quantity: number
		holdId: string
		expiresAt: Date
	}
) {
	const parsed = holdInventorySchema.parse(params)

	if (parsed.checkOut.getTime() <= parsed.checkIn.getTime()) {
		return { success: false as const, reason: "not_available" as const }
	}

	return deps.repo.holdInventory(parsed)
}
