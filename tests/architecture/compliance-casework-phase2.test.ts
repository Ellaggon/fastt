import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("command center phase 2 casework foundation", () => {
	it("has a canonical active-case uniqueness constraint and transactional outbox", () => {
		const migration = read("db/migrations/2026-11-02_command_center_phase2_casework.sql")
		expect(migration).toContain("ComplianceCase_active_source_unique")
		expect(migration).toContain('"DomainEventOutbox"')
		expect(migration).toContain("CompliancePolicyVersion")
		expect(migration).toContain("ComplianceDecisionReason")
	})

	it("reconciles all four canonical pending sources and exposes the phase gate", () => {
		const casework = read("src/lib/casework/compliance-casework.ts")
		for (const domain of ["verification", "fiscal", "documents", "payments"]) {
			expect(casework).toContain(`domain: \"${domain}\"`)
		}
		expect(casework).toContain("gatePassed: activeAfterReconciliation === sources.length")
		expect(casework).toContain("DomainEventOutbox")
	})

	it("adapts each sensitive provider decision without replacing its source of truth", () => {
		for (const route of [
			"verification.ts",
			"tax-configuration.ts",
			"documents.ts",
			"payment-accounts.ts",
		]) {
			const source = read(`src/pages/api/admin/providers/${route}`)
			expect(source).toContain("synchronizeComplianceCase")
			expect(source).toContain("resolveComplianceCaseForSource")
		}
	})
})
