import { createHash } from "node:crypto"
import { z } from "zod"

import type { InventoryHoldRepositoryPort } from "../ports/InventoryHoldRepositoryPort"
import * as persistentCache from "@/lib/cache/persistentCache"
import { cacheKeys } from "@/lib/cache/cacheKeys"

const createInventoryHoldSchema = z.object({
	variantId: z.string().min(1),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	occupancy: z.number().int().min(1),
	sessionId: z.string().min(1),
})

export type CreateInventoryHoldInput = z.infer<typeof createInventoryHoldSchema>

function parseDateOnly(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`)
}

function toStableUuidFromString(value: string): string {
	const hash = createHash("sha1").update(value).digest("hex")
	const bytes = hash.slice(0, 32).split("")
	// UUID v5 layout bits (deterministic hash-based)
	bytes[12] = "5"
	const variantNibble = parseInt(bytes[16], 16)
	bytes[16] = ((variantNibble & 0x3) | 0x8).toString(16)
	const normalized = bytes.join("")
	return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`
}

function buildIdempotencyHoldId(input: {
	sessionId: string
	variantId: string
	from: string
	to: string
}): string {
	const key = `hold:${input.sessionId}:${input.variantId}:${input.from}:${input.to}`
	return toStableUuidFromString(key)
}

export async function createInventoryHold(
	deps: {
		repo: InventoryHoldRepositoryPort
		resolvePricingSnapshot: (params: {
			variantId: string
			from: string
			to: string
			occupancy: number
		}) => Promise<unknown | null>
	},
	input: CreateInventoryHoldInput
): Promise<{ holdId: string; expiresAt: Date }> {
	const parsed = createInventoryHoldSchema.parse(input)
	const checkIn = parseDateOnly(parsed.dateRange.from)
	const checkOut = parseDateOnly(parsed.dateRange.to)

	if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
		throw new z.ZodError([
			{
				code: "custom",
				path: ["dateRange"],
				message: "Invalid date range",
			},
		])
	}

	const now = new Date()
	const holdId = buildIdempotencyHoldId({
		sessionId: parsed.sessionId,
		variantId: parsed.variantId,
		from: parsed.dateRange.from,
		to: parsed.dateRange.to,
	})

	const existing = await deps.repo.findActiveHold({ holdId, now })
	if (existing) {
		return {
			holdId: existing.holdId,
			expiresAt: existing.expiresAt,
		}
	}

	const expiresAt = new Date(now.getTime() + 10 * 60 * 1000)
	const pricingSnapshot = await deps.resolvePricingSnapshot({
		variantId: parsed.variantId,
		from: parsed.dateRange.from,
		to: parsed.dateRange.to,
		occupancy: parsed.occupancy,
	})
	const created = await deps.repo.holdInventory({
		holdId,
		variantId: parsed.variantId,
		checkIn,
		checkOut,
		quantity: parsed.occupancy,
		expiresAt,
	})

	if (!created.success) {
		throw new Error("not_available")
	}

	if (pricingSnapshot) {
		void persistentCache
			.set(cacheKeys.holdPricingSnapshot(created.holdId), pricingSnapshot, 10 * 60)
			.catch(() => {})
	}

	return {
		holdId: created.holdId,
		expiresAt: created.expiresAt,
	}
}
