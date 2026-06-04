// Public API for the financial module.
// External consumers MUST import from "@/modules/financial/public".

// Domain contracts
export * from "./domain/stage3-truth-boundary"

export * from "./domain/refund-quote"
export * from "./domain/refund-ledger"
export * from "./domain/financial-exception-record"
export * from "./domain/financial-reference"
export * from "./domain/refund-handoff-record"
export * from "./domain/financial-review-event"
export * from "./domain/payment-transaction"
export * from "./domain/financial-settlement-record"
export * from "./domain/reconciliation-match"
export * from "./domain/provider-financial-profile"
export * from "./domain/commission-snapshot"
export * from "./domain/provider-payable-snapshot"
export * from "./domain/payout-record"
export * from "./domain/provider-statement"

// Application ports
export * from "./application/ports/FinancialWorkflowRepositoryPort"
export * from "./application/ports/FinancialStage3RepositoryPort"
export * from "./application/ports/ProviderFinanceRepositoryPort"
export * from "./application/ports/RefundCalculationRepositoryPort"

// Application use-cases
export * from "./application/use-cases/detect-financial-exceptions"
export * from "./application/use-cases/build-financial-operation-review"
export * from "./application/use-cases/build-financial-review-overlay"
export * from "./application/use-cases/build-provider-finance-materialization"
export * from "./application/use-cases/build-provider-finance-summary"
export * from "./application/use-cases/list-financial-exceptions"
export * from "./application/use-cases/acknowledge-financial-exception"
export * from "./application/use-cases/resolve-financial-exception"
export * from "./application/use-cases/dismiss-financial-exception"
export * from "./application/use-cases/record-financial-reference"
export * from "./application/use-cases/acknowledge-refund-handoff"
export * from "./application/use-cases/close-refund-handoff"
export * from "./application/use-cases/dismiss-refund-handoff"
export * from "./application/use-cases/build-financial-reconciliation-match"
export * from "./application/use-cases/build-refund-quote"
export * from "./application/use-cases/create-refund-quote-before-cancellation"
export * from "./application/use-cases/record-refund-ledger"
export * from "./application/use-cases/record-refund-ledger-from-quote"

// Infrastructure export for composition-root wiring.
export { RefundCalculationRepository } from "./infrastructure/repositories/RefundCalculationRepository"
