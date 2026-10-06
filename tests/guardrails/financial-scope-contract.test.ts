import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { resolveWorkspaceScope } from "@/lib/workspace/resolveWorkspaceScope"

function read(relativePath: string) {
	return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("Guardrail: financial line scope contract (G11)", () => {
	it("resolves tour scope to tour products and vocabulary only", () => {
		const resolution = resolveWorkspaceScope({
			productTypes: ["Hotel", "Tour"],
			commercialLines: ["lodging", "tour"],
			requestedScope: "tour",
			products: [
				{ id: "hotel_1", name: "Hotel", productType: "hotel" },
				{ id: "tour_1", name: "Walk", productType: "tour" },
			],
		})
		expect(resolution).toMatchObject({
			valid: true,
			vertical: "tour",
			productIds: ["tour_1"],
		})
		if (!resolution.valid) return
		expect(resolution.vocabulary.guest).toBe("participante")
		expect(resolution.productIds).not.toContain("hotel_1")
	})

	it("rejects productId from another line", () => {
		expect(
			resolveWorkspaceScope({
				productTypes: ["Hotel", "Tour"],
				requestedScope: "tour",
				productId: "hotel_1",
				products: [
					{ id: "hotel_1", name: "Hotel", productType: "hotel" },
					{ id: "tour_1", name: "Walk", productType: "tour" },
				],
			})
		).toMatchObject({ valid: false, reason: "scope_product_mismatch" })
	})

	it("wires scope into financial BFF reads including exceptions", () => {
		const endpoints = [
			"src/pages/api/internal/financial/operations.ts",
			"src/pages/api/internal/financial/exceptions.ts",
			"src/pages/api/internal/financial/provider-finance.ts",
		]
		const violations = endpoints.flatMap((file) =>
			read(file).includes("resolveFinancialApiProductScope")
				? []
				: [`${file}: missing resolveFinancialApiProductScope`]
		)
		expect(violations).toEqual([])
	})
})

describe("Guardrail: neutral financial exception copy (G10)", () => {
	const lodgingTerms = [/room snapshot/i, /multi-room/i, /habitaci/i, /room or tax/i]

	it("keeps detect-financial-exceptions free of lodging-only wording", () => {
		const source = read(
			"src/modules/financial/application/use-cases/detect-financial-exceptions.ts"
		)
		expect(source).toContain("multi_line_review")
		expect(source).not.toContain("multi_room_review")
		for (const pattern of lodgingTerms) {
			expect(source).not.toMatch(pattern)
		}
	})

	it("keeps financial exception labels neutral in the client", () => {
		const labels = read("src/pages/financial/_client/financial-labels.ts")
		expect(labels).toContain("multi_line_review")
		expect(labels).not.toMatch(/habitaci/i)
		expect(labels).not.toMatch(/varias habitaciones/)
	})

	it("retires multi_room_review everywhere except the read-time alias and its data migration", () => {
		const offenders = execSync(
			"rg -l multi_room_review src db/postgres tests || true",
			{ cwd: process.cwd(), encoding: "utf8" }
		)
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.filter(
				(file) =>
					file !== "src/modules/financial/domain/financial-exception-record.ts" &&
					file !== "tests/guardrails/financial-scope-contract.test.ts"
			)
		expect(offenders).toEqual([])
		expect(read("db/migrations/2026-10-06_financial_exception_multi_line_review.sql")).toContain(
			"SET \"code\" = 'multi_line_review'"
		)
		expect(read("src/modules/financial/domain/financial-exception-record.ts")).toContain(
			"export function normalizeFinancialExceptionCode"
		)
	})
})

describe("Guardrail: booking detail keeps the financial scope (G3/G4)", () => {
	it("scopes the way back and labels it by origin", () => {
		const detail = read("src/pages/booking/[id].astro")
		expect(detail).toContain("workspaceNavigationScopeFromSearchParams(Astro.url.searchParams)")
		expect(detail).toContain('target.pathname.startsWith("/financial/")')
		expect(detail).toContain("Volver a finanzas")
		expect(detail).not.toMatch(/"Alojamiento"/)
	})
})
