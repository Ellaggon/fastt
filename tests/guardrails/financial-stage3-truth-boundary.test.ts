import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const boundaryPath = "src/modules/financial/domain/stage3-truth-boundary.ts"
const stage3Builder =
	"src/modules/financial/application/use-cases/build-financial-reconciliation-match.ts"
const operationBuilder =
	"src/modules/financial/application/use-cases/build-financial-operation-review.ts"

function listExistingFiles(dirs: string[]): string[] {
	const out: string[] = []
	for (const dir of dirs) {
		const root = join(process.cwd(), dir)
		if (!existsSync(root)) continue
		for (const entry of readdirSync(root)) {
			const full = join(root, entry)
			const stat = statSync(full)
			const relative = join(dir, entry)
			if (stat.isDirectory()) out.push(...listExistingFiles([relative]))
			else if (/\.ts$|\.astro$/.test(entry)) out.push(relative)
		}
	}
	return out
}

describe("Guardrail: Stage 3 truth boundary before Provider Finance", () => {
	it("declares the Stage 3 truth sources and compatibility-only sources explicitly", () => {
		const boundary = read(boundaryPath)
		const publicApi = read("src/modules/financial/public.ts")
		const requiredTruth = [
			"PaymentTransaction",
			"FinancialSettlementRecord",
			"ReconciliationMatch",
			"BookingRoomDetailSnapshotAggregation",
		]
		const compatibilityOnly = [
			"FinancialShadowRecord",
			"FinancialReference",
			"FinancialReviewEvent",
			"LegacyPaymentIntentShadow",
			"LegacySettlementShadow",
			"LegacyRefundShadow",
			"Payment",
			"ProviderPayout",
			"ProviderPayoutBooking",
			"netPayoutEstimate",
			"commissionTotal",
		]
		const violations = [
			...requiredTruth.flatMap((token) =>
				boundary.includes(token) ? [] : [`missing Stage 3 truth source ${token}`]
			),
			...compatibilityOnly.flatMap((token) =>
				boundary.includes(token) ? [] : [`missing compatibility-only source ${token}`]
			),
			publicApi.includes("./domain/stage3-truth-boundary")
				? null
				: "financial public API must export the truth boundary contract",
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("keeps legacy shadow aliases deprecated and out of Stage 3 truth naming", () => {
		const files = [
			"src/modules/financial/domain/payment-intent.ts",
			"src/modules/financial/domain/settlement-record.ts",
			"src/modules/financial/domain/refund-record.ts",
		]
		const violations = files.flatMap((file) => {
			const source = read(file)
			return [
				source.includes("@deprecated") ? null : `${file}: legacy alias must be deprecated`,
				source.includes("Compatibility alias only")
					? null
					: `${file}: legacy alias must reject truth-source semantics`,
			].filter(Boolean)
		})
		expect(violations).toEqual([])
	})

	it("keeps Stage 3 reconciliation truth away from shadow payout/payable fields", () => {
		const builder = read(stage3Builder)
		const forbidden = [/netPayoutEstimate/, /commissionTotal/, /readFinancialShadowCommission/]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(builder)
				? [
						`${stage3Builder}: Stage 3 reconciliation cannot use compatibility payout fields ${pattern}`,
					]
				: []
		)
		expect(violations).toEqual([])
	})

	it("marks operation review payout estimates as compatibility visibility only", () => {
		const source = read(operationBuilder)
		const violations = [
			source.includes("Compatibility visibility only")
				? null
				: `${operationBuilder}: shadow payout estimates must be marked compatibility-only`,
			source.includes("Provider Finance must create its own payable snapshots")
				? null
				: `${operationBuilder}: must reject Provider Finance payable truth semantics`,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("blocks future Provider Finance code from starting on legacy/shadow compatibility sources", () => {
		const candidateFiles = listExistingFiles(["src"]).filter((file) =>
			/provider[-/]?finance|providerFinance|ProviderFinance|payable|statement|payout/i.test(file)
		)
		const allowedLegacyFiles = new Set([
			boundaryPath,
			operationBuilder,
			"src/modules/financial/domain/stage3-truth-boundary.ts",
		])
		const forbidden = [
			/FinancialShadowRecord/,
			/LegacySettlementShadow/,
			/LegacyPaymentIntentShadow/,
			/LegacyRefundShadow/,
			/netPayoutEstimate/,
			/commissionTotal/,
			/ProviderPayout/,
			/ProviderPayoutBooking/,
			/\bPayment\b/,
		]
		const violations = candidateFiles.flatMap((file) => {
			if (allowedLegacyFiles.has(file)) return []
			const source = readFileSync(join(process.cwd(), file), "utf8")
			return forbidden.flatMap((pattern) =>
				pattern.test(source)
					? [`${file}: Provider Finance cannot depend on compatibility source ${pattern}`]
					: []
			)
		})
		expect(violations).toEqual([])
	})
})
