import { describe, expect, it } from "vitest"

import { collectDbWriteTargets, collectImports } from "./_guardrail-ast"
import { financialSourceFiles, read } from "./financial-stage2-guardrail-utils"

const stage4Files = financialSourceFiles.filter((file) =>
	/provider-finance|ProviderFinance|provider-financial|ProviderFinancial|commission-snapshot|CommissionSnapshot|provider-payable|ProviderPayable|payout-record|PayoutRecord|provider-statement|ProviderStatement/.test(
		file
	)
)
const providerFinanceRoute = "src/pages/api/internal/financial/provider-finance.ts"
const providerFinanceBuilder =
	"src/modules/financial/application/use-cases/build-provider-finance-summary.ts"

describe("Guardrail: financial Stage 4 provider finance foundation", () => {
	it("defines Stage 4 provider finance tables without legacy payout/payment reuse", () => {
		const dbConfig = read("db/config.ts")
		const required = [
			"ProviderFinancialProfile",
			"CommissionSnapshot",
			"ProviderPayableSnapshot",
			"PayoutRecord",
			"ProviderStatement",
		]
		const violations = required.flatMap((table) =>
			dbConfig.includes(`const ${table} = defineTable`) ? [] : [`missing ${table}`]
		)
		expect(violations).toEqual([])
	})

	it("keeps Provider Finance source-of-truth away from compatibility evidence and legacy payout tables", () => {
		const forbidden = [
			/FinancialShadowRecord/,
			/FinancialReference/,
			/LegacySettlementShadow/,
			/LegacyPaymentIntentShadow/,
			/LegacyRefundShadow/,
			/netPayoutEstimate/,
			/commissionTotal/,
			/readFinancialShadowCommission/,
			/\bPayment\b/,
			/ProviderPayout/,
			/ProviderPayoutBooking/,
		]
		const violations = stage4Files.flatMap((file) => {
			const source = read(file)
			return forbidden.flatMap((pattern) =>
				pattern.test(source)
					? [`${file}: Stage 4 provider finance must not use compatibility truth ${pattern}`]
					: []
			)
		})
		expect(violations).toEqual([])
	})

	it("keeps Provider Finance read models snapshot-only and out of pricing/inventory runtime", () => {
		const violations = stage4Files.flatMap((file) => {
			const source = read(file)
			const imports = collectImports(file)
			const runtimeImports = imports.flatMap((entry) =>
				/modules\/pricing|modules\/inventory|lib\/pricing|lib\/inventory|pricing-runtime|inventory-runtime/.test(
					entry.module
				)
					? [`${file}: imports forbidden runtime ${entry.module}`]
					: []
			)
			return [
				...runtimeImports,
				/recalculate|rerate|live pricing|inventory hold/i.test(source)
					? `${file}: provider finance must not recompute pricing or inventory`
					: null,
			].filter(Boolean)
		})
		expect(violations).toEqual([])
	})

	it("blocks payout execution and accounting semantics in Provider Finance surfaces", () => {
		const forbidden = [
			/send payout/i,
			/execute payout/i,
			/payout completed/i,
			/transfer sent/i,
			/bank processed/i,
			/recognized revenue/i,
			/accounting export/i,
			/ledger entry/i,
			/payout executed/i,
			/settled payout/i,
			/provider balance/i,
			/provider wallet/i,
			/tax filing/i,
			/bank transfer/i,
			/settlement automation/i,
		]
		const violations = stage4Files.flatMap((file) => {
			const source = read(file)
			return forbidden.flatMap((pattern) =>
				pattern.test(source)
					? [`${file}: provider finance contains payout/accounting theater ${pattern}`]
					: []
			)
		})
		expect(violations).toEqual([])
	})

	it("keeps Provider Finance GET endpoints read-only", () => {
		const source = read(providerFinanceRoute)
		const violations = [
			source.includes("export const GET") ? null : "provider finance route must expose GET",
			/\.insert\(|\.update\(|\.delete\(|\.values\(/.test(source)
				? "provider finance GET must not write"
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("limits Stage 4 repositories to Stage 4 table writes only", () => {
		const allowed = new Set([
			"ProviderFinancialProfile",
			"CommissionSnapshot",
			"ProviderPayableSnapshot",
			"PayoutRecord",
			"ProviderStatement",
		])
		const repositoryFiles = stage4Files.filter((file) =>
			file.includes("infrastructure/repositories")
		)
		const violations = repositoryFiles.flatMap((file) => {
			const imports = collectImports(file)
			const dbImports = new Map(
				imports
					.filter((entry) => entry.module === "astro:db")
					.map((entry) => [entry.local, entry.imported])
			)
			return collectDbWriteTargets(file).flatMap((write) => {
				const target = dbImports.get(write.target) ?? write.target
				return allowed.has(target) ? [] : [`${file}: forbidden Stage 4 write to ${target}`]
			})
		})
		expect(violations).toEqual([])
	})

	it("documents the deliberate commission gap instead of inventing commission from runtime pricing", () => {
		const builder = read(providerFinanceBuilder)
		expect(builder).toContain("commission_snapshot_missing")
		expect(builder).toContain("CommissionSnapshot")
		expect(builder).not.toMatch(
			/modules\/pricing|lib\/pricing|rate engine|commissionTotal|netPayoutEstimate/i
		)
	})

	it("keeps Stage 4.1 materialization deterministic, read-only, and explainable", () => {
		const materialization = read(
			"src/modules/financial/application/use-cases/build-provider-finance-materialization.ts"
		)
		expect(materialization).toContain("buildProviderFinanceMaterialization")
		expect(materialization).toContain("fingerprint")
		expect(materialization).toContain("staleReasons")
		expect(materialization).toContain("BookingRoomDetail.totalPrice")
		expect(materialization).toContain("ProviderPayableSnapshot")
		expect(materialization).not.toMatch(/\.insert\(|\.update\(|\.delete\(|FinancialShadowRecord/)
	})
})
