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
			"FinancialReference",
			"FinancialReviewEvent",
			"Payment",
			"ProviderPayout",
			"ProviderPayoutBooking",
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

	it("keeps deleted legacy shadow aliases out of the source tree", () => {
		const files = [
			"src/modules/financial/domain/payment-intent.ts",
			"src/modules/financial/domain/settlement-record.ts",
			"src/modules/financial/domain/refund-record.ts",
		]
		const violations = files.flatMap((file) =>
			existsSync(join(process.cwd(), file)) ? [`${file}: deleted legacy alias came back`] : []
		)
		expect(violations).toEqual([])
	})

	it("keeps Stage 3 reconciliation truth away from legacy payout/payable fields", () => {
		const builder = read(stage3Builder)
		const forbidden = [/netPayoutEstimate/, /commissionTotal/, /readFinancial.*Shadow/]
		const violations = forbidden.flatMap((pattern) =>
			pattern.test(builder)
				? [
						`${stage3Builder}: Stage 3 reconciliation cannot use compatibility payout fields ${pattern}`,
					]
				: []
		)
		expect(violations).toEqual([])
	})

	it("keeps operation review free of shadow payout estimates", () => {
		const source = read(operationBuilder)
		const violations = [
			/netPayoutEstimate|commissionTotal|financial_shadow|FinancialShadow|readFinancial.*Shadow/.test(
				source
			)
				? `${operationBuilder}: deleted shadow payout compatibility came back`
				: null,
		].filter(Boolean)
		expect(violations).toEqual([])
	})

	it("blocks future Provider Finance code from starting on legacy compatibility sources", () => {
		const candidateFiles = listExistingFiles(["src"]).filter((file) =>
			/provider[-/]?finance|providerFinance|ProviderFinance|payable|statement|payout/i.test(file)
		)
		const allowedLegacyFiles = new Set([
			boundaryPath,
			operationBuilder,
			"src/modules/financial/domain/stage3-truth-boundary.ts",
		])
		const forbidden = [
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
