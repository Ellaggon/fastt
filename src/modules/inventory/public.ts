// Public API for the inventory module.
// External consumers MUST import from "@/modules/inventory/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Application use-cases
export { holdInventory } from "./application/use-cases/hold-inventory"
export { createInventoryHold } from "./application/use-cases/create-inventory-hold"
export { releaseInventoryHold } from "./application/use-cases/release-inventory-hold"
export { releaseExpiredHolds } from "./application/use-cases/release-expired-holds"
export type {
	RecomputeEffectiveAvailabilityRangeResult,
	RecomputeDeps,
} from "./application/use-cases/recompute-effective-availability-range"
export {
	simulateBulkInventoryOperation,
	applyBulkInventoryOperation,
} from "./application/use-cases/bulk-inventory-service"

// Application services
export * from "./application/services/InventorySeederService"

// Application ports
export * from "./application/ports/DailyInventoryRepositoryPort"
export * from "./application/ports/InventoryBootstrapPort"
export * from "./application/ports/InventoryRepositoryPort"
export * from "./application/ports/VariantInventoryConfigRepositoryPort"
export * from "./application/ports/InventoryHoldRepositoryPort"
export * from "./application/ports/InventoryRecomputeRepositoryPort"

export async function recomputeEffectiveAvailabilityRange(
	input: {
		variantId: string
		from: string
		to: string
		reason: string
		idempotencyKey?: string
	},
	deps?: import("./application/use-cases/recompute-effective-availability-range").RecomputeDeps
) {
	const { recomputeEffectiveAvailabilityRange } = await import(
		"./application/use-cases/recompute-effective-availability-range"
	)
	const defaultDeps: import("./application/use-cases/recompute-effective-availability-range").RecomputeDeps =
		deps ??
		(await import("@/container").then((container) => ({
			loadDailyInventoryRange: (params: { variantId: string; from: string; to: string }) =>
				container.inventoryRecomputeRepository.loadDailyInventoryRange(params),
			loadInventoryLocksRange: (params: { variantId: string; from: string; to: string }) =>
				container.inventoryRecomputeRepository.loadInventoryLocksRange(params),
			upsertEffectiveAvailabilityRows: (rows: any[]) =>
				container.inventoryRecomputeRepository.upsertEffectiveAvailabilityRows(rows),
			now: () => new Date(),
		})))
	return recomputeEffectiveAvailabilityRange(input, {
		loadDailyInventoryRange: defaultDeps.loadDailyInventoryRange,
		loadInventoryLocksRange: defaultDeps.loadInventoryLocksRange,
		upsertEffectiveAvailabilityRows: defaultDeps.upsertEffectiveAvailabilityRows,
		now: defaultDeps.now,
	})
}

export async function applyInventoryMutation<T>(params: {
	mutate: () => Promise<T>
	recompute:
		| {
				variantId: string
				from: string
				to: string
				reason: string
				idempotencyKey?: string
		  }
		| Array<{
				variantId: string
				from: string
				to: string
				reason: string
				idempotencyKey?: string
		  }>
		| ((result: T) =>
				| {
						variantId: string
						from: string
						to: string
						reason: string
						idempotencyKey?: string
				  }
				| Array<{
						variantId: string
						from: string
						to: string
						reason: string
						idempotencyKey?: string
				  }>)
	failSoft?: boolean
	logContext?: Record<string, unknown>
	recomputeDeps?: import("./application/use-cases/recompute-effective-availability-range").RecomputeDeps
}) {
	const { applyInventoryMutation } = await import(
		"./application/use-cases/apply-inventory-mutation"
	)
	const defaultDeps: import("./application/use-cases/recompute-effective-availability-range").RecomputeDeps =
		params.recomputeDeps ??
		(await import("@/container").then((container) => ({
			loadDailyInventoryRange: (input: { variantId: string; from: string; to: string }) =>
				container.inventoryRecomputeRepository.loadDailyInventoryRange(input),
			loadInventoryLocksRange: (input: { variantId: string; from: string; to: string }) =>
				container.inventoryRecomputeRepository.loadInventoryLocksRange(input),
			upsertEffectiveAvailabilityRows: (rows: any[]) =>
				container.inventoryRecomputeRepository.upsertEffectiveAvailabilityRows(rows),
			now: () => new Date(),
		})))
	return applyInventoryMutation({
		...params,
		recomputeDeps: defaultDeps,
	})
}
