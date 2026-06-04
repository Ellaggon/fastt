import { describe, expect, it } from "vitest"

import { collectDbWriteTargets, collectImports } from "./_guardrail-ast"
import { financialSourceFiles } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial Stage 2 write boundaries", () => {
	const allowedWorkflowTables = new Set([
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

	it("allows Stage 2 workflow writes only to financial workflow tables", () => {
		const violations = financialSourceFiles.flatMap((file) => {
			if (!file.startsWith("src/modules/financial/")) return []
			if (file.endsWith("FinancialRepository.ts")) return []
			const imports = collectImports(file)
			const astroDbImportByLocal = new Map(
				imports
					.filter((entry) => entry.module === "astro:db")
					.map((entry) => [entry.local, entry.imported])
			)
			return collectDbWriteTargets(file).flatMap((write) => {
				const importedTable = astroDbImportByLocal.get(write.target) ?? write.target
				return allowedWorkflowTables.has(importedTable)
					? []
					: [
							`${file}: ${write.method} writes ${importedTable}; financial Stage 2 may only write workflow records`,
						]
			})
		})
		expect(violations).toEqual([])
	})

	it("blocks financial route handlers from writing external OTA ownership tables", () => {
		const forbiddenTables = new Set([
			"Booking",
			"BookingRoomDetail",
			"BookingTaxFee",
			"Payment",
			"ProviderPayout",
			"ProviderPayoutBooking",
			"Product",
			"Variant",
			"PricingRule",
			"RatePlan",
			"Inventory",
		])
		const violations = financialSourceFiles.flatMap((file) => {
			if (!file.startsWith("src/pages/api/internal/financial/")) return []
			const imports = collectImports(file)
			const astroDbImportByLocal = new Map(
				imports
					.filter((entry) => entry.module === "astro:db")
					.map((entry) => [entry.local, entry.imported])
			)
			return collectDbWriteTargets(file).flatMap((write) => {
				const importedTable = astroDbImportByLocal.get(write.target) ?? write.target
				return forbiddenTables.has(importedTable)
					? [`${file}: ${write.method} writes forbidden ownership table ${importedTable}`]
					: []
			})
		})
		expect(violations).toEqual([])
	})
})
