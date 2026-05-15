// Public API for the financial module.
// External consumers MUST import from "@/modules/financial/public".

// Domain contracts
export * from "./domain/payment-intent"
export * from "./domain/settlement-record"
export * from "./domain/refund-record"
export * from "./domain/financial-exception-record"
export * from "./domain/financial-reference"
export * from "./domain/refund-handoff-record"
export * from "./domain/financial-review-event"

// Application ports
export * from "./application/ports/FinancialRepositoryPort"
export * from "./application/ports/FinancialEventPublisherPort"
export * from "./application/ports/FinancialWorkflowRepositoryPort"

// Application use-cases
export * from "./application/use-cases/register-financial-shadow-write"
export * from "./application/use-cases/detect-financial-exceptions"
export * from "./application/use-cases/build-financial-operation-review"
export * from "./application/use-cases/build-financial-review-overlay"
export * from "./application/use-cases/list-financial-exceptions"
export * from "./application/use-cases/acknowledge-financial-exception"
export * from "./application/use-cases/resolve-financial-exception"
export * from "./application/use-cases/dismiss-financial-exception"
export * from "./application/use-cases/record-financial-reference"
export * from "./application/use-cases/acknowledge-refund-handoff"
export * from "./application/use-cases/close-refund-handoff"
export * from "./application/use-cases/dismiss-refund-handoff"
