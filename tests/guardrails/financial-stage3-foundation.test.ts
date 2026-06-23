import { describe, expect, it } from "vitest"

import { collectDbWriteTargets, collectImports } from "./_guardrail-ast"
import { financialSourceFiles, read } from "./financial-stage2-guardrail-utils"

const stage3Domains = [
	"src/modules/financial/domain/payment-transaction.ts",
	"src/modules/financial/domain/financial-settlement-record.ts",
	"src/modules/financial/domain/reconciliation-match.ts",
]
const reconciliationBuilder =
	"src/modules/financial/application/use-cases/build-financial-reconciliation-match.ts"
const reconciliationRoute = "src/pages/api/internal/financial/reconciliation.ts"
const reconciliationQueueRoute = "src/pages/api/internal/financial/reconciliation-queue.ts"

describe("Guardrail: financial Stage 3 foundation stays evidence-based", () => {
	it("defines real Stage 3 models without reusing legacy finance tables", () => {
		const dbConfig = read("db/config.ts")
		const violations = [
			...["PaymentTransaction", "FinancialSettlementRecord", "ReconciliationMatch"].flatMap(
				(table) => (dbConfig.includes(`const ${table} = defineTable`) ? [] : [`missing ${table}`])
			),
			/const SettlementRecord = defineTable/.test(dbConfig)
				? "Stage 3 must not introduce a real table named SettlementRecord"
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps PaymentTransaction separate from FinancialReference and legacy Payment", () => {
		const source = financialSourceFiles.map((file) => `// ${file}\n${read(file)}`).join("\n")
		const paymentTransactionDomain = read("src/modules/financial/domain/payment-transaction.ts")
		const violations = [
			paymentTransactionDomain.includes("must not be backed by the legacy Payment table")
				? null
				: "PaymentTransaction domain must reject legacy Payment backing",
			/FinancialReference\s+as\s+PaymentTransaction/.test(source)
				? "FinancialReference must not be aliased as PaymentTransaction"
				: null,
			/Payment\s+as\s+PaymentTransaction/.test(source)
				? "legacy Payment must not be aliased as PaymentTransaction"
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps reconciliation deterministic, snapshot-based, and out of pricing runtime", () => {
		const builder = read(reconciliationBuilder)
		const route = read(reconciliationRoute)
		const queueRoute = read(reconciliationQueueRoute)
		const violations = [
			builder.includes("buildFinancialOperationReview")
				? null
				: "Stage 3 reconciliation must reuse snapshot-safe operation review input",
			builder.includes("BookingRoomDetail") || route.includes("BookingRoomDetail.totalAmount")
				? null
				: "reconciliation must aggregate BookingRoomDetail snapshots",
			/pricing\/|modules\/pricing|ensurePricing|EffectivePricing/.test(
				`${builder}\n${route}\n${queueRoute}`
			)
				? "reconciliation must not import pricing runtime"
				: null,
			/\.insert\(|\.update\(|\.delete\(/.test(`${route}\n${queueRoute}`)
				? "Stage 3 reconciliation GET routes must stay read-only"
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("blocks PSP execution and accounting wording in Stage 3 sources", () => {
		const source = financialSourceFiles.map((file) => `// ${file}\n${read(file)}`).join("\n")
		const forbidden = [
			/capturePayment/,
			/executeRefund/,
			/retryPayment/,
			/settlePayout/,
			/sendPayout/,
			/createLedgerEntry/,
			/paymentCompleted/,
			/refundProcessed/,
			/payoutSent/,
			/settlementExecuted/,
		]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(source)
				? [`Financial Stage 3 source contains fake execution wording ${pattern}`]
				: []
		)
		expect(violations).toEqual([])
	})

	it("limits financial writes to Stage 2/3 financial tables only", () => {
		const allowed = new Set([
			"FinancialExceptionRecord",
			"FinancialReference",
			"RefundHandoffRecord",
			"FinancialReviewEvent",
			"PaymentTransaction",
			"FinancialSettlementRecord",
			"ReconciliationMatch",
			"ProviderFinancialProfile",
			"CommissionSnapshot",
			"ProviderPayableSnapshot",
			"PayoutRecord",
			"ProviderStatement",
			"RefundQuote",
			"RefundLedger",
		])
		const violations = financialSourceFiles.flatMap((file) => {
			if (!file.startsWith("src/modules/financial/")) return []
			const imports = collectImports(file)
			const dbImports = new Map(
				imports
					.filter((entry) => entry.module === "astro:db")
					.map((entry) => [entry.local, entry.imported])
			)
			return collectDbWriteTargets(file).flatMap((write) => {
				const target = dbImports.get(write.target) ?? write.target
				return allowed.has(target) ? [] : [`${file}: forbidden financial write target ${target}`]
			})
		})
		expect(violations).toEqual([])
	})

	it("documents Stage 3 domain semantics explicitly", () => {
		const violations = stage3Domains.flatMap((file) => {
			const source = read(file)
			return source.includes("Stage 3") ? [] : [`${file}: missing Stage 3 semantic comment`]
		})
		expect(violations).toEqual([])
	})
})
