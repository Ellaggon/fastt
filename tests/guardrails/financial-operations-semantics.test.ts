import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { collectCalls, collectHttpExportMethods, collectImports } from "./_guardrail-ast"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const financialPage = "src/pages/financial/index.astro"
const financialBff = "src/pages/api/internal/financial/operations.ts"

const bannedRuntimeCalls = new Set([
	"computeEffectivePricingV2",
	"computePricePreview",
	"previewPricingRules",
	"materializeEffectivePricing",
	"createInventoryHold",
	"releaseInventoryHold",
	"consumeInventory",
	"materializeAvailability",
	"executeRefund",
	"capturePayment",
	"settlePayout",
	"issueInvoice",
	"createLedgerEntry",
])

describe("Guardrail: Financial Operations enterprise semantics", () => {
	it("keeps financial read models snapshot-first and out of pricing/inventory engines", () => {
		const imports = collectImports(financialBff)
		const calls = collectCalls(financialBff)
		const violations = [
			...imports.flatMap((entry) => {
				if (entry.module.includes("/modules/pricing/") || entry.module.includes("/lib/pricing/")) {
					return [`${financialBff}: imports pricing runtime ${entry.module}`]
				}
				if (
					entry.module.includes("/modules/inventory/") ||
					entry.module.includes("/lib/inventory/")
				) {
					return [`${financialBff}: imports inventory runtime ${entry.module}`]
				}
				if (entry.module.includes("/modules/catalog/")) {
					return [`${financialBff}: imports catalog module ${entry.module}`]
				}
				return []
			}),
			...calls.flatMap((call) =>
				bannedRuntimeCalls.has(call.leaf)
					? [`${financialBff}: forbidden financial/runtime orchestration call ${call.calleePath}`]
					: []
			),
		]

		expect(
			violations,
			`Financial Operations may show booking/financial snapshots, not recompute or orchestrate external runtimes:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps financial operations BFF read-only and free of fake PSP/accounting workflows", () => {
		const source = read(financialBff)
		const methods = collectHttpExportMethods(financialBff)
		const forbidden = [
			/PaymentProvider/,
			/chargeback/i,
			/dispute/i,
			/retry payment/i,
			/execute refund/i,
			/settle payout/i,
			/issue invoice/i,
			/accounting automation/i,
		]
		const violations = [
			...[...methods].map((method) => `${financialBff}: exports ${method} on a read BFF`),
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`${financialBff}: fake finance workflow ${pattern}`] : []
			),
		]

		expect(
			violations,
			`Financial Operations must stay visibility/reconciliation only, not PSP/accounting orchestration:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("keeps contract value visibility multi-room snapshot aware", () => {
		const source = read(financialBff)
		const violations = [
			source.includes("const detailTotal = group.reduce")
				? null
				: `${financialBff}: contract total must aggregate booking room snapshots`,
			source.includes("const contractTotal = detailTotal > 0 ? detailTotal : fallbackTotal")
				? null
				: `${financialBff}: contract total must prefer room snapshot totals before booking fallback totals`,
			source.includes("const contractTotal = Number(first.detailTotalPrice")
				? `${financialBff}: contract total must not use only the first room detail`
				: null,
		].filter(Boolean)

		expect(
			violations,
			`Financial visibility must not understate multi-room booking contracts:\n${violations.join("\n")}`
		).toEqual([])
	})

	it("requires honest finance UX framing without command-center or analytics theater", () => {
		const source = read(financialPage)
		const requiredSignals = [
			"Financial Operations & Reconciliation Workspace",
			"Snapshot-safe finance visibility",
			"no orquesta PSP",
			"no recalcula pricing",
			"ledger contable",
		]
		const forbiddenTheater = [/command center/i, /\bAI\b/i, /forecast/i, /revenue optimization/i]
		const violations = [
			...requiredSignals.flatMap((signal) =>
				source.includes(signal) ? [] : [`${financialPage}: missing ${signal}`]
			),
			...forbiddenTheater.flatMap((pattern) =>
				pattern.test(source) ? [`${financialPage}: forbidden finance theater ${pattern}`] : []
			),
		]

		expect(
			violations,
			`Financial UX must communicate operational visibility without theater:\n${violations.join("\n")}`
		).toEqual([])
	})
})
