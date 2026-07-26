import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("statement timeout hardening (docs submit path)", () => {
	it("scopes open compliance assignments in SQL (no full-table scan)", () => {
		const ops = read("src/lib/provider-compliance-ops.ts")
		expect(ops).toContain("eq(ProviderComplianceAssignment.status, \"open\")")
		expect(ops).toContain("eq(ProviderComplianceAssignment.providerId, providerId)")
		expect(ops).toContain(".limit(")
		expect(ops).not.toMatch(/\.filter\(\(row\) => row\.status === \"open\"\)/)
	})

	it("does not rethrow audit write failures / timeouts", () => {
		const audit = read("src/lib/provider-audit.ts")
		expect(audit).toContain("statement timeout")
		expect(audit).toContain("canceling statement")
		expect(audit).not.toMatch(/throw error\s*\n\s*\}\s*\n\s*\}\)/)
	})

	it("treats statement timeouts as soft failures in governance safe()", () => {
		const gov = read("src/lib/provider-governance.ts")
		expect(gov).toContain("isStatementTimeout")
		expect(gov).toContain("canceling statement")
		expect(gov).toContain("provider.governance.query_timeout")
	})

	it("isolates background governance refresh from unhandled rejections", () => {
		const inv = read("src/lib/cache/invalidation.ts")
		expect(inv).toContain("provider configuration refresh failed")
		expect(inv).toContain("Fire-and-forget")
	})

	it("avoids re-listing all documents after submit", () => {
		const docs = read("src/lib/provider-documents.ts")
		expect(docs).toContain("Avoid a second full list query")
		expect(docs).toContain("return mapRow({")
	})
})
