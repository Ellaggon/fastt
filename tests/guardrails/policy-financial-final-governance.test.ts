import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { listFilesUnderRoot } from "./_file-utils"

function read(relativePath: string): string {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "")
}

function extractFunctionBody(source: string, functionName: string): string {
	const marker = `export function ${functionName}`
	const start = source.indexOf(marker)
	if (start < 0) return ""
	const signatureEnd = source.indexOf("): PolicyCalculationResult {", start)
	const firstBrace =
		signatureEnd >= 0 ? source.indexOf("{", signatureEnd) : source.indexOf("{", start)
	if (firstBrace < 0) return ""
	let depth = 0
	for (let index = firstBrace; index < source.length; index++) {
		const char = source[index]
		if (char === "{") depth++
		if (char === "}") depth--
		if (depth === 0) return source.slice(firstBrace + 1, index)
	}
	return ""
}

describe("Guardrail: final policy and refund governance", () => {
	it("does not use RatePlanTemplate paymentType/refundable as contractual source", () => {
		const files = [
			...listFilesUnderRoot("src", ".ts"),
			...listFilesUnderRoot("src", ".astro"),
		].filter((file) => !file.includes("test-support") && !file.includes("legacy"))
		const violations = files.flatMap((file) => {
			const source = stripComments(read(file))
			const forbidden = [
				/RatePlanTemplate\.(paymentType|refundable)/,
				/(paymentType|refundable)\s*:\s*RatePlanTemplate\.(paymentType|refundable)/,
			]
			return forbidden.some((pattern) => pattern.test(source))
				? [`${file}: reads RatePlanTemplate paymentType/refundable as contract`]
				: []
		})

		expect(violations).toEqual([])
	})

	it("requires active policies to be created with owner provider governance", () => {
		const createPolicy = read("src/modules/policies/application/use-cases/capa6/create-policy.ts")
		const replaceAssignment = read(
			"src/modules/policies/application/use-cases/capa6/replace-policy-assignment.ts"
		)

		expect(createPolicy).toContain("ownerProviderId")
		expect(createPolicy).toContain("owner_provider_required")
		expect(replaceAssignment).toContain("owner_provider_required")
		expect(replaceAssignment).toContain("owner_provider_mismatch")
	})

	it("requires policy snapshots to include source policy id, group id, and version", () => {
		const snapshot = read("src/modules/policies/application/use-cases/build-policy-snapshot.ts")
		const bookingSnapshot = read(
			"src/modules/booking/application/use-cases/snapshot-policies-for-booking.ts"
		)

		expect(snapshot).toContain("source:")
		expect(snapshot).toContain("policyId: String(entry.policy.id)")
		expect(snapshot).toContain("groupId: String(entry.policy.groupId)")
		expect(snapshot).toContain("version: Number(entry.policy.version")
		expect(bookingSnapshot).toContain("source: enriched?.source")
		expect(bookingSnapshot).toContain("version: Number(p.policy.version")
	})

	it("blocks cancellation snapshots without calculable refund tiers", () => {
		const calculation = read(
			"src/modules/policies/application/use-cases/build-policy-calculation-snapshot.ts"
		)
		const body = extractFunctionBody(calculation, "buildPolicyCalculationSnapshot")

		expect(body).toContain("refundTiers")
		expect(body).toContain("deadlineLocal")
		expect(body).toContain("refundPercent")
		expect(body).toContain("refundBasis")
		expect(body).toContain("payoutImpact")
		expect(body).toContain("taxesFeesBasis")
	})

	it("prevents refund ledger persistence without a quote lookup and persistent uniqueness", () => {
		const repo = read(
			"src/modules/financial/infrastructure/repositories/RefundCalculationRepository.ts"
		)
		const useCase = read(
			"src/modules/financial/application/use-cases/record-refund-ledger-from-quote.ts"
		)
		const dbConfig = read("db/config.ts")
		const migration = read("db/migrations/2026-06-07_refund_ledger_idempotency.sql")

		expect(useCase).toContain("findQuoteById")
		expect(useCase).toContain("REFUND_QUOTE_NOT_FOUND")
		expect(repo).toContain("findLedgerByQuoteId")
		expect(repo).toMatch(/db\s*\.\s*insert\s*\(\s*RefundLedgerTable\s*\)/)
		expect(dbConfig).toContain('{ on: ["refundQuoteId"], unique: true }')
		expect(migration).toContain("idx_refund_ledger_quote_unique")
	})
})
