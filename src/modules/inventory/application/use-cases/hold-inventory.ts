import { z } from "zod"
import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"
import { isHoldCommercialSnapshot, type HoldCommercialSnapshot } from "../hold-commercial-snapshot"

const holdInventorySchema = z.object({
	variantId: z.string().min(1),
	ratePlanId: z.string().min(1),
	checkIn: z.date(),
	checkOut: z.date(),
	quantity: z.number().int().min(1),
	holdId: z.string().uuid(),
	expiresAt: z.date(),
	channel: z.string().trim().min(1).nullable().optional(),
	policySnapshotJson: z.unknown(),
	guestExpectationsSnapshotJson: z.unknown().nullable().optional(),
	commercialSnapshot: z.unknown(),
})

export async function holdInventory(
	deps: { repo: InventoryHoldRepositoryPort },
	params: {
		variantId: string
		ratePlanId: string
		checkIn: Date
		checkOut: Date
		quantity: number
		holdId: string
		expiresAt: Date
		channel?: string | null
		policySnapshotJson: unknown
		guestExpectationsSnapshotJson?: unknown | null
		commercialSnapshot: HoldCommercialSnapshot
	}
) {
	const parsed = holdInventorySchema.parse(params)

	if (parsed.checkOut.getTime() <= parsed.checkIn.getTime()) {
		return { success: false as const, reason: "not_available" as const }
	}
	if (!isHoldCommercialSnapshot(params.commercialSnapshot)) {
		throw new Error("PRICING_SNAPSHOT_INVALID")
	}

	return deps.repo.holdInventory({
		...parsed,
		policySnapshotJson: params.policySnapshotJson,
		guestExpectationsSnapshotJson: params.guestExpectationsSnapshotJson ?? null,
		commercialSnapshot: params.commercialSnapshot,
	})
}
