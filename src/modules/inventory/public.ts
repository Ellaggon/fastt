// Public API for the inventory module.
// External consumers MUST import from "@/modules/inventory/public".
// NOTE: Infrastructure exports exist only to support composition-root wiring (container).

// Domain
export * from "./domain/InventoryReservationService"

// Application use-cases
export { canReserveInventory } from "./application/use-cases/can-reserve-inventory"
export { recomputeInventory } from "./application/use-cases/recompute-inventory"
export { holdInventory } from "./application/use-cases/hold-inventory"
export { releaseInventoryHold } from "./application/use-cases/release-inventory-hold"
export { releaseExpiredHolds } from "./application/use-cases/release-expired-holds"
export type { DailyInventorySnapshot } from "./application/use-cases/can-reserve-inventory"

// Application services
export * from "./application/services/AvailabilityService"
export * from "./application/services/InventorySeederService"

// Application ports
export * from "./application/ports/DailyInventoryRepositoryPort"
export * from "./application/ports/InventoryBootstrapPort"
export * from "./application/ports/InventoryRepositoryPort"
export * from "./application/ports/VariantInventoryConfigRepositoryPort"
export * from "./application/ports/InventoryHoldRepositoryPort"
