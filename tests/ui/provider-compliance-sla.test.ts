import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	buildProviderComplianceSlaMirror,
	formatAdminComplianceSlaSummary,
} from "@/lib/provider-compliance-ops"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S2-4 admin SLA/assignee + provider mirror", () => {
	it("formats admin SLA summary and provider mirror without leaking assignee to hosts", () => {
		const assignment = {
			assigneeEmail: "ops@fastt.test",
			slaHours: 48,
			slaDueAt: new Date("2026-08-01T15:00:00.000Z"),
			slaState: "due_soon" as const,
		}
		const admin = formatAdminComplianceSlaSummary(assignment)
		expect(admin).toContain("ops@fastt.test")
		expect(admin).toContain("48h")
		expect(admin).toContain("por vencer")

		const mirror = buildProviderComplianceSlaMirror(assignment)
		expect(mirror.hasPublishedSla).toBe(true)
		expect(mirror.footnote).toContain("Objetivo de respuesta")
		expect(mirror.footnote).not.toContain("ops@fastt.test")
		expect(buildProviderComplianceSlaMirror(null).hasPublishedSla).toBe(false)
	})

	it("wires SLA assign UI on verification/fiscal/docs/payments and mirrors on provider pages", () => {
		const admin = read("src/pages/admin/providers.astro")
		const assign = read("src/components/admin/AdminComplianceSlaAssign.astro")
		const verification = read("src/pages/provider/settings/verification.astro")
		const identity = read("src/pages/provider/settings/tax-fees/identity.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")
		const ops = read("src/lib/provider-compliance-ops.ts")

		expect(admin).toContain("AdminComplianceSlaAssign")
		expect(admin).toContain('domain="verification"')
		expect(admin).toContain('domain="fiscal"')
		expect(admin).toContain('domain="documents"')
		expect(admin).toContain('domain="payments"')

		expect(assign).toContain("data-assign-ops")
		expect(assign).toContain("Asignar SLA")
		expect(assign).toContain("formatAdminComplianceSlaSummary")

		expect(verification).toContain("listOpenComplianceAssignments")
		expect(verification).toContain("verificationAssignment")
		expect(verification).toContain("documentAssignments")
		expect(identity).toContain("listOpenComplianceAssignments")
		expect(identity).toContain("fiscalAssignment")
		expect(view).toContain('domain="verification"')
		expect(view).toContain("assignment={reviewAssignment}")

		expect(ops).toContain("buildProviderComplianceSlaMirror")
		expect(ops).toContain("formatAdminComplianceSlaSummary")
	})
})
