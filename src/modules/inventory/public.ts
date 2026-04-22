// Public API for the inventory module.
// External consumers MUST import from "@/modules/inventory/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Application use-cases
export { holdInventory } from "./application/use-cases/hold-inventory"
export { createInventoryHold } from "./application/use-cases/create-inventory-hold"
export { releaseInventoryHold } from "./application/use-cases/release-inventory-hold"
export { releaseExpiredHolds } from "./application/use-cases/release-expired-holds"
export { recomputeEffectiveAvailabilityRange } from "./application/use-cases/recompute-effective-availability-range"
export { applyInventoryMutation } from "./application/use-cases/apply-inventory-mutation"
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
