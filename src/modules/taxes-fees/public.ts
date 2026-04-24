// Public API for the taxes-fees module.

// Domain
export * from "./domain/tax-fee.types"

// Application use-cases
export * from "./application/use-cases/create-tax-fee-definition"
export * from "./application/use-cases/assign-tax-fee"
export * from "./application/use-cases/resolve-effective-tax-fees"
export * from "./application/use-cases/compute-tax-breakdown"
export * from "./application/use-cases/snapshot-tax-fees-for-booking"
export * from "./application/use-cases/list-tax-fee-definitions"
export * from "./application/use-cases/list-tax-fee-assignments"
export * from "./application/use-cases/build-tax-fee-warnings"
export * from "./application/use-cases/update-tax-fee-definition"

// Application ports
export * from "./application/ports/TaxFeeCommandRepositoryPort"
export * from "./application/ports/TaxFeeResolutionRepositoryPort"
export * from "./application/ports/BookingTaxFeeRepositoryPort"
export * from "./application/ports/TaxFeeQueryRepositoryPort"

// Composition root helpers (stable module entrypoint for wiring)
export * from "./infrastructure/runtime/create-taxes-fees-runtime"
